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
