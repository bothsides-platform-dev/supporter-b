'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { requirePgSession } from '@/lib/auth/session';
import { bids } from '@/lib/db/schema';
import {
  getBidRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import { actionDb, type BidActionResult } from './_shared';

const Input = z
  .object({
    bidId: z.string().uuid(),
  })
  .strict();

export type WithdrawBidInput = z.infer<typeof Input>;
export type WithdrawBidResult = BidActionResult;

/**
 * PG 제안 철회 — bid.status='withdrawn'.
 *
 * 가드:
 *   1) requirePgSession.
 *   2) bid 조회 → bid.pgWsId === session.workspaceId (제출 워크스페이스 일치).
 *   3) canAccess(rfpId, pgWsId) — 초대된 워크스페이스 멤버라면 동료 제안도 철회 가능.
 *
 * NOTE (advisor pin 4): withdrawn 이후 재제출은 v0에서 막는다 — submitBid가 다시
 * UNIQUE(rfpId, pgWsId) 충돌로 'BID_ALREADY_SUBMITTED' 반환.
 */
export async function withdrawBidAction(
  input: WithdrawBidInput,
): Promise<WithdrawBidResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const bidRepo = await getBidRepo();
  const bid = await bidRepo.findById(parsed.data.bidId);
  if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

  // 같은 ws 가드 — bid.pgWsId === session.user.workspaceId.
  if (bid.pgWsId !== session.user.workspaceId) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  // canAccess — 워크스페이스 단위 가드. bid.pgWsId 일치 검증과 더불어 invitation
  // row 가 active 상태인지 더블체크.
  const invRepo = await getInvitationRepo();
  const ok = await invRepo.canAccess(bid.rfpId, session.user.workspaceId);
  if (!ok) return { ok: false, error: 'FORBIDDEN' };

  if (bid.status === 'withdrawn') return { ok: true };

  const db = actionDb();
  await db
    .update(bids)
    .set({ status: 'withdrawn' })
    .where(eq(bids.id, bid.id));

  return { ok: true };
}
