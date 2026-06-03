'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { requirePgSession } from '@/lib/auth/session';
import { rfpAllowedPg, rfps, workspaceMembers, workspaces } from '@/lib/db/schema';
import { getPgRequestRepo } from '@/lib/server/repositories/factory';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import { actionDb, type RfpActionResult } from './_shared';
import { isUniqueViolation } from '@/lib/server/actions/auth/_shared';

const Input = z
  .object({
    rfpId: z.string().regex(/^P-\d{4}-\d{4}$/),
    message: z.string().trim().min(1).max(1000),
  })
  .strict();

export type CreatePgRequestInput = z.input<typeof Input>;
export type CreatePgRequestResult = RfpActionResult;

/**
 * 비초대 PG가 오픈 게시판에서 보내는 참여 요청(콜드 피치). 구매사가 수락해야
 * 실제 참여(allowlist 진입)한다. 쌍당 1요청(UNIQUE) — 거절은 영구.
 */
export async function createPgRequestAction(
  input: CreatePgRequestInput,
): Promise<CreatePgRequestResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = session.user.workspaceId;
  const userId = session.user.id;
  const code = parsed.data.rfpId;
  const db = actionDb();
  const now = new Date();
  const pendingEmits: Notification[] = [];

  const result = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<CreatePgRequestResult> => {
      const [rfpRow] = await tx
        .select({
          id: rfps.id,
          buyerWsId: rfps.buyerWsId,
          status: rfps.status,
          deadline: rfps.deadline,
          boardVisible: rfps.boardVisible,
        })
        .from(rfps)
        .where(eq(rfps.code, code))
        .limit(1);
      // 숨김(board_visible=false)·미존재는 발견 불가 — 존재를 드러내지 않도록 NOT_FOUND.
      if (!rfpRow || !rfpRow.boardVisible) return { ok: false, error: 'NOT_FOUND' };
      if (rfpRow.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };
      if (new Date(rfpRow.deadline).getTime() <= now.getTime()) {
        return { ok: false, error: 'RFP_DEADLINE_PASSED' };
      }

      // 이미 초대(allowlist)된 PG면 요청 불필요.
      const [allowed] = await tx
        .select({ pgWsId: rfpAllowedPg.pgWsId })
        .from(rfpAllowedPg)
        .where(and(eq(rfpAllowedPg.rfpId, rfpRow.id), eq(rfpAllowedPg.pgWsId, wsId)))
        .limit(1);
      if (allowed) return { ok: false, error: 'ALREADY_PARTICIPATING' };

      const reqRepo = await getPgRequestRepo();
      if (await reqRepo.findPairStatus(rfpRow.id, wsId, tx)) {
        return { ok: false, error: 'ALREADY_REQUESTED' };
      }

      try {
        await reqRepo.create(
          {
            id: randomUUID(),
            rfpId: rfpRow.id,
            pgWsId: wsId,
            message: parsed.data.message,
            status: 'pending',
            createdByUserId: userId,
            createdAt: now.toISOString(),
          },
          tx,
        );
      } catch (err) {
        // 동시 진입 race — UNIQUE(rfp_id, pg_ws_id) 가 막은 경우.
        if (isUniqueViolation(err)) return { ok: false, error: 'ALREADY_REQUESTED' };
        throw err;
      }

      // 구매사 워크스페이스 전 멤버에게 인앱 알림.
      const [pgWsRow] = await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, wsId))
        .limit(1);
      const pgWsName = pgWsRow?.name ?? 'PG사';

      const buyerMembers = (await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, rfpRow.buyerWsId))) as { userId: string }[];
      for (const m of buyerMembers) {
        const notif: Notification = {
          id: randomUUID(),
          userId: m.userId,
          workspaceId: rfpRow.buyerWsId,
          type: 'pg.request.received',
          title: `[${code}] 새 참여 요청`,
          body: `${pgWsName}가 이 RFP에 참여를 요청했어요.`,
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/rfp/${code}`,
          createdAt: now.toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      return { ok: true };
    },
  );

  if (result.ok) emitAfterCommit(pendingEmits);
  return result;
}
