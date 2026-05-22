'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import {
  bids,
  rfps,
  users,
  workspaceMembers,
} from '@/lib/db/schema';
import {
  getContractRepo,
  getOutboxRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import { renderRfpAwarded } from '@/lib/server/outbox/templates/rfpAwarded';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import type { Notification } from '@/lib/types/notification';
import { actionDb, type RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().min(1),
    awardedBidId: z.string().uuid(),
  })
  .strict();

export type AwardRfpInput = z.infer<typeof Input>;
export type AwardRfpResult = RfpActionResult;

/**
 * RFP 수주 확정.
 *
 * 트랜잭션:
 *   1) ownership 검증 — `rfp.buyer_ws_id === session.workspaceId`
 *   2) `rfpRepo.transition(id, 'awarded', { awardedBidId })`
 *      DB 레이어 `WHERE status='sent'` 가드 + assertTransition 동시 적용
 *   3) `contracts` insert (RFP 1:1 unique — 중복 awardRfp 시 throw 안 하고
 *      onConflictDoNothing)
 *   4) **알림 비대칭 (advisor pin 6)**:
 *        - winner = 낙찰 PG ws 멤버 each:
 *            notifications.insert(channel='in_app', type='rfp.awarded')
 *          + outbox_entries.enqueue(rfp.awarded, dedupe rfp:{id}:awarded:{email})
 *        - loser  = 다른 입찰 PG ws 멤버 each (status='submitted', id != awardedBid):
 *            notifications.insert(channel='in_app', type='rfp.rejected')
 *          ❌ outbox enqueue **안 함** — 이메일 안 보냄.
 */
export async function awardRfpAction(
  input: AwardRfpInput,
): Promise<AwardRfpResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const { rfpId, awardedBidId } = parsed.data;
  const wsId = session.user.workspaceId;
  const userId = session.user.id;
  const db = actionDb();

  // SSE emit는 commit 이후 1회. tx 내에서 만든 notification을 모았다가
  // tx 정상 종료 시 bus.emit. tx throw 시 자연 누락 → rollback과 SSE 정합.
  const pendingEmits: Notification[] = [];

  const result: AwardRfpResult = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<AwardRfpResult> => {
      // 1. ownership 검증 — title도 함께 픽업해 rfp.awarded 메일에 사용.
      const [rfpRow] = await tx
        .select({
          buyerWsId: rfps.buyerWsId,
          status: rfps.status,
          title: rfps.title,
          code: rfps.code,
        })
        .from(rfps)
        .where(eq(rfps.id, rfpId))
        .limit(1);
      if (!rfpRow) return { ok: false, error: 'RFP_NOT_FOUND' };
      if (rfpRow.buyerWsId !== wsId) {
        return { ok: false, error: 'FORBIDDEN_BUYER' };
      }
      // 알림/메일에 노출되는 RFP 식별자는 사람용 code(P-YYMM-NNNN). 특히 linkUrl은
      // /inbox/<code>여야 한다 — inbox 라우트가 code로 조회하므로 uuid면 깨진 링크.
      // (dedupeKey 등 내부 키는 계속 uuid 사용.)
      const rfpCode = rfpRow.code;

      // 2. transition — repo가 assertTransition + WHERE status='sent' 가드.
      const rfpRepo = await getRfpRepo();
      try {
        await rfpRepo.transition(rfpId, 'awarded', { awardedBidId }, tx);
      } catch (e) {
        return {
          ok: false,
          error: `INVALID_TRANSITION: ${(e as Error).message}`,
        };
      }

      // 3. contract row.
      const contracts = await getContractRepo();
      await contracts.save(
        {
          id: randomUUID(),
          rfpId,
          bidId: awardedBidId,
          awardedAt: new Date().toISOString(),
          awardedBy: userId,
        },
        tx,
      );

      // 4. winner / loser 분리. settleCycle은 winner row에서 픽업해 메일에 사용.
      const allBids = await tx
        .select({
          id: bids.id,
          pgWsId: bids.pgWsId,
          settleCycle: bids.settleCycle,
        })
        .from(bids)
        .where(and(eq(bids.rfpId, rfpId), eq(bids.status, 'submitted')));

      type BidRow = { id: string; pgWsId: string; settleCycle: string };
      const winner = (allBids as BidRow[]).find(
        (b) => b.id === awardedBidId,
      );
      if (!winner) return { ok: false, error: 'WINNING_BID_NOT_FOUND' };

      const losers = (allBids as BidRow[]).filter(
        (b) => b.id !== awardedBidId,
      );

      const outbox = await getOutboxRepo();

      // — winner: in-app 알림 N + 이메일 outbox N (멤버 수만큼)
      const winnerMembers = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, winner.pgWsId));
      for (const m of winnerMembers as { userId: string }[]) {
        const notif: Notification = {
          id: randomUUID(),
          userId: m.userId,
          workspaceId: winner.pgWsId,
          type: 'rfp.awarded',
          title: `[${rfpCode}] 낙찰`,
          body: '제출하신 제안이 낙찰되었습니다.',
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/inbox/${rfpCode}`,
          createdAt: new Date().toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      // 이메일은 사람 단위가 아니라 RFP × ws 단위 1통 — 정책상 멤버별로 보낼
      // 이유 없음 + dedupeKey 필요. 여기서는 winner 멤버 each address 로 발송
      // (각자 이메일이 다름) + dedupe `rfp:{id}:awarded:{email}` 로 collapse.
      const winnerEmails = await tx
        .select({ email: users.email })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, winner.pgWsId));
      const awardedHtml = await renderRfpAwarded({
        rfpId: rfpCode,
        rfpTitle: rfpRow.title,
        bidId: awardedBidId,
        settlementCycle: winner.settleCycle,
      });
      for (const row of winnerEmails as { email: string }[]) {
        await outbox.enqueue(
          {
            event: 'rfp.awarded',
            to: row.email,
            subject: `[Supporter B · ${rfpCode}] 낙찰 결과`,
            html: awardedHtml,
            dedupeKey: `rfp:${rfpId}:awarded:${row.email}`,
          },
          tx,
        );
      }

      // — loser: in-app 알림만 (이메일 없음 — advisor pin 6).
      for (const loser of losers) {
        const memberRows = await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.workspaceId, loser.pgWsId));
        for (const m of memberRows as { userId: string }[]) {
          const notif: Notification = {
            id: randomUUID(),
            userId: m.userId,
            workspaceId: loser.pgWsId,
            type: 'rfp.rejected',
            title: `[${rfpCode}] 미낙찰`,
            body: '다른 PG가 선정되었습니다.',
            channel: 'inapp',
            status: 'pending',
            linkUrl: `/inbox/${rfpCode}`,
            createdAt: new Date().toISOString(),
          };
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }
      }

      return { ok: true };
    },
  );

  // commit 후에만 SSE emit — Step 9 dispatch 패턴(advisor pin 3).
  if (result.ok) {
    emitAfterCommit(pendingEmits);
    // Outbox drain — winner 메일 즉시 전송 시도, 실패 시 cron 안전망.
    flushAfterCommit();
  }
  return result;
}
