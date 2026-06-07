'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import {
  rfpAllowedPg,
  rfpInvitations,
  rfps,
  users,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import {
  getInvitationRepo,
  getOutboxRepo,
  getPgRequestRepo,
} from '@/lib/server/repositories/factory';
import { generateToken, hashToken } from '@/lib/server/token';
import { renderRfpInvited } from '@/lib/server/outbox/templates/rfpInvited';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import { actionDb, baseUrl, type RfpActionResult } from './_shared';

const Input = z.object({ requestId: z.string().uuid() }).strict();

export type AcceptPgRequestInput = z.input<typeof Input>;
export type AcceptPgRequestResult = RfpActionResult;

/**
 * 구매사가 PG의 참여 요청을 수락 — 단일 트랜잭션으로 allowlist 추가 + 실토큰
 * invitation 발행 + rfp.invited 메일 + 인앱 알림 + 요청 accepted 마킹.
 * createRfpAction send-branch 와 동일 패턴. 이미 초대돼 있으면 invitation/메일은
 * 건너뛰어 멱등.
 */
export async function acceptPgRequestAction(
  input: AcceptPgRequestInput,
): Promise<AcceptPgRequestResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = session.user.workspaceId;
  const userId = session.user.id;
  const db = actionDb();
  const now = new Date();
  const pendingEmits: Notification[] = [];

  const result = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<AcceptPgRequestResult> => {
      const reqRepo = await getPgRequestRepo();
      const req = await reqRepo.findById(parsed.data.requestId, tx);
      if (!req) return { ok: false, error: 'NOT_FOUND' };
      if (req.status !== 'pending') return { ok: false, error: 'NOT_PENDING' };

      const [rfpRow] = await tx
        .select({
          id: rfps.id,
          code: rfps.code,
          buyerWsId: rfps.buyerWsId,
          title: rfps.title,
          status: rfps.status,
          deadline: rfps.deadline,
        })
        .from(rfps)
        .where(eq(rfps.id, req.rfpId))
        .limit(1);
      if (!rfpRow) return { ok: false, error: 'NOT_FOUND' };
      if (rfpRow.buyerWsId !== wsId) return { ok: false, error: 'NOT_OWNED' };
      if (rfpRow.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };
      if (new Date(rfpRow.deadline).getTime() <= now.getTime()) {
        return { ok: false, error: 'RFP_DEADLINE_PASSED' };
      }

      const [buyerWsRow] = await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, rfpRow.buyerWsId))
        .limit(1);
      const buyerName = buyerWsRow?.name ?? '구매사';

      // allowlist 추가 — 멱등 (이미 있으면 무시).
      await tx
        .insert(rfpAllowedPg)
        .values({ rfpId: req.rfpId, pgWsId: req.pgWsId })
        .onConflictDoNothing();

      // invitation 처리 — (rfp_id, pg_ws_id) UNIQUE 라 분기한다:
      //  · 없음        → 실토큰으로 신규 발행
      //  · draft       → 실토큰으로 격상(buyer가 RfpInviteManager로 먼저 추가해
      //                  draft 만 있는 경우. draft 는 canAccess 에서 제외되므로
      //                  반드시 sent 로 올려야 PG가 접근 가능)
      //  · 그 외(실초대) → 멱등 skip (이미 접근 가능)
      const [existingInv] = await tx
        .select({ id: rfpInvitations.id, status: rfpInvitations.status })
        .from(rfpInvitations)
        .where(and(eq(rfpInvitations.rfpId, req.rfpId), eq(rfpInvitations.pgWsId, req.pgWsId)))
        .limit(1);
      const needsInvite = !existingInv || existingInv.status === 'draft';
      if (needsInvite) {
        const rawToken = generateToken();
        if (existingInv) {
          // draft 격상 — sendDraftInvitationsAction 과 동일하게 실토큰+sent 로 갱신.
          await tx
            .update(rfpInvitations)
            .set({
              tokenHash: hashToken(rawToken),
              status: 'pending',
              sentAt: now,
              expiresAt: new Date(rfpRow.deadline),
            })
            .where(eq(rfpInvitations.id, existingInv.id));
        } else {
          const invRepo = await getInvitationRepo();
          await invRepo.save(
            {
              id: randomUUID(),
              rfpId: req.rfpId,
              pgWsId: req.pgWsId,
              uniqueToken: '',
              sentAt: now.toISOString(),
              expiresAt: new Date(rfpRow.deadline).toISOString(),
              status: 'sent',
            },
            rawToken,
            tx,
          );
        }

        const outbox = await getOutboxRepo();
        const deadlineDisplay = new Date(rfpRow.deadline)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 16);
        const adminRows = (await tx
          .select({ userId: workspaceMembers.userId, email: users.email })
          .from(workspaceMembers)
          .innerJoin(users, eq(workspaceMembers.userId, users.id))
          .where(
            and(
              eq(workspaceMembers.workspaceId, req.pgWsId),
              eq(workspaceMembers.role, 'admin'),
            ),
          )) as { userId: string; email: string }[];
        for (const admin of adminRows) {
          const inviteUrl = `${baseUrl()}/invite/rfp/${rawToken}`;
          const html = await renderRfpInvited({
            rfpId: rfpRow.code,
            rfpTitle: rfpRow.title,
            buyerName,
            deadline: deadlineDisplay,
            inviteUrl,
          });
          await outbox.enqueue(
            {
              event: 'rfp.invited',
              to: admin.email,
              subject: `[Supporter B · ${rfpRow.code}] 견적 요청이 도착했어요`,
              html,
              dedupeKey: `rfp:${req.rfpId}:invite:ws:${req.pgWsId}:user:${admin.userId}`,
            },
            tx,
          );
        }
      }

      // PG 전 멤버에게 수락 인앱 알림.
      const pgMembers = (await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, req.pgWsId))) as { userId: string }[];
      for (const m of pgMembers) {
        const notif: Notification = {
          id: randomUUID(),
          userId: m.userId,
          workspaceId: req.pgWsId,
          type: 'pg.request.accepted',
          title: `[${rfpRow.code}] 참여 요청 수락됨`,
          body: `${buyerName}가 참여 요청을 수락했어요. 이제 견적을 보낼 수 있어요.`,
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/inbox/${rfpRow.code}`,
          createdAt: now.toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      await reqRepo.markDecided(req.id, 'accepted', userId, now, tx);
      return { ok: true };
    },
  );

  if (result.ok) {
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
  }
  return result;
}
