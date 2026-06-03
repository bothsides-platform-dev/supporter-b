'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import { rfps, workspaceMembers } from '@/lib/db/schema';
import { getPgRequestRepo } from '@/lib/server/repositories/factory';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import { actionDb, type RfpActionResult } from './_shared';

const Input = z.object({ requestId: z.string().uuid() }).strict();

export type RejectPgRequestInput = z.input<typeof Input>;
export type RejectPgRequestResult = RfpActionResult;

/**
 * 구매사가 PG의 참여 요청을 거절 — 영구(재요청 경로 없음). PG에 인앱 알림.
 */
export async function rejectPgRequestAction(
  input: RejectPgRequestInput,
): Promise<RejectPgRequestResult> {
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
    async (tx: any): Promise<RejectPgRequestResult> => {
      const reqRepo = await getPgRequestRepo();
      const req = await reqRepo.findById(parsed.data.requestId, tx);
      if (!req) return { ok: false, error: 'NOT_FOUND' };
      if (req.status !== 'pending') return { ok: false, error: 'NOT_PENDING' };

      const [rfpRow] = await tx
        .select({ code: rfps.code, buyerWsId: rfps.buyerWsId })
        .from(rfps)
        .where(eq(rfps.id, req.rfpId))
        .limit(1);
      if (!rfpRow) return { ok: false, error: 'NOT_FOUND' };
      if (rfpRow.buyerWsId !== wsId) return { ok: false, error: 'NOT_OWNED' };

      await reqRepo.markDecided(req.id, 'rejected', userId, now, tx);

      const pgMembers = (await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, req.pgWsId))) as { userId: string }[];
      for (const m of pgMembers) {
        const notif: Notification = {
          id: randomUUID(),
          userId: m.userId,
          workspaceId: req.pgWsId,
          type: 'pg.request.rejected',
          title: `[${rfpRow.code}] 참여 요청 마감`,
          body: '아쉽지만 이번 RFP에는 참여가 어려워요.',
          channel: 'inapp',
          status: 'pending',
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
