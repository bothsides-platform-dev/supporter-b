'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getBidRepo, getRfpRepo } from '@/lib/server/repositories/factory';
import type { BidActionResult } from './_shared';

const Input = z
  .object({
    bidId: z.string().uuid(),
    to: z.enum(['pending', 'negotiating', 'decided']),
  })
  .strict();

export type UpdateBuyerStageInput = z.infer<typeof Input>;
export type UpdateBuyerStageResult = BidActionResult;

/**
 * 구매사 측 칸반 stage 갱신. lib/stores/bid-board.ts 의 `moveStage` 를
 * 대체하는 server-side cutover (Stage 3c).
 *
 * 가드:
 *   1) requireBuyerSession.
 *   2) bid 조회 → bid.rfpId → rfp.buyerWsId === session.workspaceId.
 *   3) (관련 RFP 가 awarded 면 모든 stage 가 'decided' 고정 — UI 책임이지만
 *       서버에서도 한 번 더 차단. v0 정책: PG_RFP_SPEC §7.)
 */
export async function updateBuyerStageAction(
  input: UpdateBuyerStageInput,
): Promise<UpdateBuyerStageResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const bidRepo = await getBidRepo();
  const bid = await bidRepo.findById(parsed.data.bidId);
  if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findById(bid.rfpId);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };

  if (rfp.buyerWsId !== session.user.workspaceId) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  // Awarded RFP locks every bid to 'decided' — PG_RFP_SPEC §7. UI also
  // disables the kanban drop targets but this is the server gate.
  if (rfp.status === 'awarded' && parsed.data.to !== 'decided') {
    return { ok: false, error: 'RFP_AWARDED_LOCKED' };
  }

  await bidRepo.updateBuyerStage(parsed.data.bidId, parsed.data.to);
  return { ok: true };
}
