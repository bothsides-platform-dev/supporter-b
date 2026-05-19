'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import {
  rfpInvitations,
  rfps,
  workspaceMembers,
  workspaces,
  users,
} from '@/lib/db/schema';
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { generateToken, hashToken } from '@/lib/server/token';
import { renderRfpInvited } from '@/lib/server/outbox/templates/rfpInvited';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import {
  actionDb,
  baseUrl,
  type RfpActionResult,
} from './_shared';

const Input = z
  .object({
    rfpId: z.string().regex(/^Q-\d{4}-\d{4}$/),
  })
  .strict();

export type SendDraftInvitationsInput = z.input<typeof Input>;
export type SendDraftInvitationsResult = RfpActionResult<{ sentCount: number }>;

/**
 * `addPgWorkspacesToRfpAction`이 누적해둔 `'draft'` invitation row 일괄 발송.
 *
 * 흐름:
 *   1. 권한 + RFP open 가드(status='sent' && deadline > now).
 *   2. draft 행 select (각 행에 pgWsId 포함).
 *   3. 고유 pgWsId들의 모든 멤버(email 포함)를 단일 배치 쿼리로 조회.
 *   4. 각 PG 워크스페이스의 전체 멤버에게 인앱 알림 발송.
 *   5. 각 draft마다:
 *      - fresh rawToken 발급 → tokenHash 갱신 + status='pending'(DB).
 *      - 해당 워크스페이스 admin 멤버 각각에게 이메일 enqueue.
 *      - dedupeKey: `rfp:{rfpId}:invite:ws:{pgWsId}:user:{adminUserId}`.
 *   6. post-commit flush.
 */
export async function sendDraftInvitationsAction(
  input: SendDraftInvitationsInput,
): Promise<SendDraftInvitationsResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = session.user.workspaceId;
  const db = actionDb();

  const pendingEmits: Notification[] = [];

  const result = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<SendDraftInvitationsResult> => {
      const [rfpRow] = await tx
        .select({
          id: rfps.id,
          buyerWsId: rfps.buyerWsId,
          status: rfps.status,
          deadline: rfps.deadline,
          title: rfps.title,
        })
        .from(rfps)
        .where(eq(rfps.id, parsed.data.rfpId))
        .limit(1);
      if (!rfpRow) return { ok: false, error: 'NOT_FOUND' };
      if (rfpRow.buyerWsId !== wsId) return { ok: false, error: 'NOT_OWNED' };
      if (rfpRow.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };
      if (new Date(rfpRow.deadline).getTime() <= Date.now()) {
        return { ok: false, error: 'RFP_DEADLINE_PASSED' };
      }

      const drafts = await tx
        .select()
        .from(rfpInvitations)
        .where(
          and(
            eq(rfpInvitations.rfpId, parsed.data.rfpId),
            eq(rfpInvitations.status, 'draft'),
          ),
        );
      if (drafts.length === 0) {
        return { ok: true, sentCount: 0 };
      }

      const [wsRow] = await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, wsId))
        .limit(1);
      const buyerName = wsRow?.name ?? '구매사';
      const deadlineDisplay = new Date(rfpRow.deadline)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 16);
      const outbox = await getOutboxRepo();

      const now = new Date();

      // Collect all unique PG workspace IDs from drafts.
      const uniquePgWsIds = Array.from(
        new Set((drafts as { pgWsId: string }[]).map((d) => d.pgWsId)),
      );

      // Batch-fetch all members (with email) for all PG workspaces in one query.
      const allMembers = (await tx
        .select({
          workspaceId: workspaceMembers.workspaceId,
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
          email: users.email,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(inArray(workspaceMembers.workspaceId, uniquePgWsIds))) as {
        workspaceId: string;
        userId: string;
        role: string;
        email: string;
      }[];

      // Build lookup maps: wsId → all members, wsId → admin members only.
      const membersByWs = new Map<
        string,
        { workspaceId: string; userId: string; role: string; email: string }[]
      >();
      for (const m of allMembers) {
        const list = membersByWs.get(m.workspaceId) ?? [];
        list.push(m);
        membersByWs.set(m.workspaceId, list);
      }

      // Dispatch in-app notifications to ALL members of each PG workspace.
      for (const pgWsId of uniquePgWsIds) {
        const members = membersByWs.get(pgWsId) ?? [];
        for (const m of members) {
          const notif: Notification = {
            id: randomUUID(),
            userId: m.userId,
            workspaceId: pgWsId,
            type: 'rfp.invited',
            title: `[${rfpRow.id}] 제안 요청 도착`,
            body: `${buyerName}가 제안을 요청했습니다.`,
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfpRow.id}`,
            createdAt: now.toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }
      }

      // Process each draft invitation: generate token, update row, email admins.
      let sentCount = 0;
      for (const draft of drafts as { id: string; pgWsId: string }[]) {
        const rawToken = generateToken();
        await tx
          .update(rfpInvitations)
          .set({
            tokenHash: hashToken(rawToken),
            status: 'pending',
            sentAt: new Date(),
          })
          .where(eq(rfpInvitations.id, draft.id));

        const inviteUrl = `${baseUrl()}/invite/rfp/${rawToken}`;
        const html = await renderRfpInvited({
          rfpId: rfpRow.id,
          rfpTitle: rfpRow.title,
          buyerName,
          deadline: deadlineDisplay,
          inviteUrl,
        });

        // Send email to each admin of this workspace using the same invite URL.
        const wsMembers = membersByWs.get(draft.pgWsId) ?? [];
        const admins = wsMembers.filter((m) => m.role === 'admin');
        for (const admin of admins) {
          await outbox.enqueue(
            {
              event: 'rfp.invited',
              to: admin.email,
              subject: `[Supporter B · ${rfpRow.id}] 제안 요청 도착`,
              html,
              dedupeKey: `rfp:${rfpRow.id}:invite:ws:${draft.pgWsId}:user:${admin.userId}`,
            },
            tx,
          );
        }
        sentCount += 1;
      }

      return { ok: true, sentCount };
    },
  );

  if (result.ok) {
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
  }
  return result;
}
