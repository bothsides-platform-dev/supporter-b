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
  ) => ({
    label,
    color,
    needsResponse,
    actionLabel,
    tab,
    nextActor: needsResponse ? '우리 PG사' : label === '견적 보냄' ? '구매사' : '',
    nextAction:
      label === '수정 요청'
        ? '구매사가 요청한 조건을 수정해요'
        : label === '신규'
          ? '요청 조건을 확인하고 검토를 시작해요'
          : label === '검토 중'
            ? '견적 조건을 작성해요'
            : label === '견적 보냄'
              ? '보낸 견적을 검토하고 선정해요'
              : label === '선정됨'
                ? '선정 결과와 구매사 연락처를 확인해요'
                : label === '마감'
                  ? '응답 접수를 마쳤어요'
                  : `${label} · 요청과 보낸 견적을 확인할 수 있어요`,
  });
  if (row.rfpStatus === 'awarded' || row.stage === 'won') {
    return result(
      row.stage === 'won' ? '선정됨' : '미선정',
      row.stage === 'won' ? 'tertiary' : 'surface',
      false,
      '견적 결과',
    );
  }
  if (row.rfpStatus === 'cancelled') return result('취소', 'surface', false, '견적 결과');
  if (row.reviewStatus === 'rejected')
    return result('상담 거절', 'surface', false, '요청 보기', 'request');
  if (row.reviewStatus === 'withdrawn')
    return result('견적 철회', 'surface', false, '요청 보기', 'request');
  if (row.reviewStatus === 'buyer_ended')
    return result('상담 종료', 'surface', false, '요청 보기', 'request');
  if (row.rfpStatus === 'closed') return result('종료', 'surface', false, '견적 결과');
  const open =
    row.bidWindowOpen !== false &&
    isRfpBidWindowOpen({ status: row.rfpStatus ?? 'sent', deadline: row.rfpDeadline }, now);
  if (row.hasPendingRequote && open && row.stage !== 'lost')
    return result('수정 요청', 'warning', true, '견적 수정');
  if (row.stage === 'submitted') return result('견적 보냄', 'tertiary', false, '보낸 견적');
  if (
    row.stage === 'lost' ||
    row.bidWindowOpen === false ||
    !isRfpBidWindowOpen({ status: row.rfpStatus ?? 'sent', deadline: row.rfpDeadline }, now)
  ) {
    return result('마감', 'surface', false, '견적 결과');
  }
  if (row.hasPendingRequote) return result('수정 요청', 'warning', true, '견적 수정');
  return result(
    row.reviewStatus === 'reviewing' ? '검토 중' : '신규',
    'warning',
    true,
    row.reviewStatus === 'requested' ? '검토 시작' : '견적 작성',
    row.reviewStatus === 'requested' ? 'request' : 'write',
  );
}
