'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import { bids, rfps, workspaceMembers } from '@/lib/db/schema';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import { actionDb, type RfpActionResult } from './_shared';

const Input = z.object({ rfpId: z.string().min(1) }).strict();

export type CloseRfpInput = z.infer<typeof Input>;
export type CloseRfpResult = RfpActionResult;

/**
 * RFP 마감. buyer 워크스페이스 ownership 검증 + transition('closed').
 * 알림은 입찰 제출 PG ws 멤버 each — 인앱만(이메일 없음).
 */
export async function closeRfpAction(
  input: CloseRfpInput,
): Promise<CloseRfpResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const { rfpId } = parsed.data;
  const wsId = session.user.workspaceId;
  const db = actionDb();

  const pendingEmits: Notification[] = [];

  const result: CloseRfpResult = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<CloseRfpResult> => {
      // 호출부는 사람용 code(P-YYMM-NNNN)를 넘긴다. FK·transition은 uuid(rfps.id)
      // 기준이라 code로 행을 찾아 uuid를 해소한다. 알림 linkUrl/title은 code(=rfpId)
      // 유지 — inbox 라우트가 code로 조회.
      const [row] = await tx
        .select({ id: rfps.id, buyerWsId: rfps.buyerWsId })
        .from(rfps)
        .where(eq(rfps.code, rfpId))
        .limit(1);
      if (!row) return { ok: false, error: 'RFP_NOT_FOUND' };
      if (row.buyerWsId !== wsId) {
        return { ok: false, error: 'FORBIDDEN_BUYER' };
      }

      const repo = await getRfpRepo();
      try {
        await repo.transition(row.id, 'closed', undefined, tx);
      } catch (e) {
        return {
          ok: false,
          error: `INVALID_TRANSITION: ${(e as Error).message}`,
        };
      }

      const submittedBids = await tx
        .select({ pgWsId: bids.pgWsId })
        .from(bids)
        .where(and(eq(bids.rfpId, row.id), eq(bids.status, 'submitted')));
      const wsSet = new Set<string>(
        (submittedBids as { pgWsId: string }[]).map((b) => b.pgWsId),
      );
      for (const pgWsId of wsSet) {
        const members = await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.workspaceId, pgWsId));
        for (const m of members as { userId: string }[]) {
          const notif: Notification = {
            id: randomUUID(),
            userId: m.userId,
            workspaceId: pgWsId,
            type: 'rfp.closed',
            title: `[${rfpId}] 마감됨`,
            body: '구매사가 견적 요청을 마감했어요.',
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfpId}`,
            createdAt: new Date().toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }
      }

      return { ok: true };
    },
  );

  if (result.ok) emitAfterCommit(pendingEmits);
  return result;
}
