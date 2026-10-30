import type { PgReview } from './pg-matching';
import type { RfpStatus } from '@/lib/types/rfp';
import type { PgKanbanStage } from '@/lib/server/pg-kanban';
import { isRfpBidWindowOpen } from './bid-window';

export type PgRequestStateInput = {
  stage: PgKanbanStage;
  rfpStatus?: RfpStatus;
  reviewStatus?: PgReview['status'];
  rfpDeadline: string;
  hasPendingRequote?: boolean;
  bidWindowOpen?: boolean;
};

/** Display policy only; submission authorization remains in BidService. */
export function pgRequestState(row: PgRequestStateInput, now = Date.now()) {
  const result = (
    label: string,
    color: 'surface' | 'warning' | 'tertiary',
    needsResponse: boolean,
    actionLabel: string,
    tab: 'request' | 'write' = 'write',
  ) => ({ label, color, needsResponse, actionLabel, tab });
  if (row.rfpStatus === 'awarded' || row.stage === 'won') {
    return result(
      row.stage === 'won' ? '선정됨' : '미선정',
      row.stage === 'won' ? 'tertiary' : 'surface',
      false,
      '견적 결과',
    );
  }
  if (row.rfpStatus === 'cancelled')
    return result('취소', 'surface', false, '견적 결과');
  if (row.reviewStatus === 'rejected')
    return result('상담 거절', 'surface', false, '요청 보기', 'request');
  if (row.reviewStatus === 'withdrawn')
    return result('견적 철회', 'surface', false, '요청 보기', 'request');
  if (row.reviewStatus === 'buyer_ended')
    return result('상담 종료', 'surface', false, '요청 보기', 'request');
  if (
    row.stage === 'lost' ||
    row.bidWindowOpen === false ||
    !isRfpBidWindowOpen(
      { status: row.rfpStatus ?? 'sent', deadline: row.rfpDeadline },
      now,
    )
  ) {
    return result('마감', 'surface', false, '견적 결과');
  }
  if (row.hasPendingRequote)
    return result('수정 요청', 'warning', true, '견적 수정');
  if (row.stage === 'submitted')
    return result('견적 보냄', 'tertiary', false, '보낸 견적');
  return result(
    row.reviewStatus === 'reviewing' ? '검토 중' : '신규',
    'warning',
    true,
    '견적 작성',
  );
}
