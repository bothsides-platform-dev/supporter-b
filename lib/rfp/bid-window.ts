import type { RFP } from '@/lib/types/rfp';

/** 견적을 접수할 수 있는 요청인지 판정하는 공통 규칙. */
export function isRfpBidWindowOpen(
  rfp: Pick<RFP, 'status' | 'deadline'>,
  nowMs = Date.now(),
): boolean {
  return rfp.status === 'sent' && new Date(rfp.deadline).getTime() > nowMs;
}

/** PG별 재요청이 있으면 공용 RFP 마감 대신 그 응답 마감을 쓴다. */
export function isPgBidWindowOpen(
  rfp: Pick<RFP, 'status' | 'deadline'>,
  pendingRequoteDeadline?: string,
  nowMs = Date.now(),
): boolean {
  return isRfpBidWindowOpen(
    { ...rfp, deadline: pendingRequoteDeadline ?? rfp.deadline },
    nowMs,
  );
}

type BidSubmissionWindowError =
  | 'RFP_NOT_OPEN'
  | 'BID_ALREADY_SUBMITTED'
  | 'REQUOTE_DEADLINE_PASSED';

type BidSubmissionRoundResult =
  | { ok: true; round: number }
  | { ok: false; error: BidSubmissionWindowError };

/** 최초 제출·재요청 응답의 라운드와 유효 마감을 같은 규칙으로 판정한다. */
export function resolveBidSubmissionRound(input: {
  rfp: Pick<RFP, 'status' | 'deadline'>;
  maxRound: number;
  pendingRequoteDeadline?: string;
  nowMs?: number;
}): BidSubmissionRoundResult {
  const nowMs = input.nowMs ?? Date.now();
  if (input.rfp.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };

  if (input.maxRound === 0) {
    return isRfpBidWindowOpen(input.rfp, nowMs)
      ? { ok: true, round: 1 }
      : { ok: false, error: 'RFP_NOT_OPEN' };
  }

  if (!input.pendingRequoteDeadline) {
    return { ok: false, error: 'BID_ALREADY_SUBMITTED' };
  }
  return new Date(input.pendingRequoteDeadline).getTime() > nowMs
    ? { ok: true, round: input.maxRound + 1 }
    : { ok: false, error: 'REQUOTE_DEADLINE_PASSED' };
}
