import type { ChipColor } from '@/components/primitives/Chip';
import type { RFP, RfpStatus } from '@/lib/types/rfp';
import { isRfpBidWindowOpen } from '@/lib/rfp/bid-window';
import type { PgReview } from '@/lib/rfp/pg-matching';

// 견적 상태/요청 칩의 단일 출처 — 정식 딜룸 페이지, @modal 인터셉트, 목록표가 공유한다.
// (이전엔 STATUS 맵이 rfp/[id]·rfp/@modal 에 중복 + RfpListTable 에 statusLabel/statusColor
// 로 3중 복제돼 손으로 동기화해야 했다.)

export type StatusChip = { label: string; color: ChipColor };

// RfpStatus 전체를 매핑 — 키가 빠지면 컴파일 에러로 잡힌다.
export const RFP_STATUS_CHIP: Record<RfpStatus, StatusChip> = {
  draft: { label: '임시저장', color: 'surface' },
  sent: { label: '요청 보냄', color: 'warning' },
  closed: { label: '미선정', color: 'surface' },
  awarded: { label: '선정완료', color: 'tertiary' },
  cancelled: { label: '취소', color: 'error' },
};

// 문자열 상태를 받아 칩을 돌려준다. 알 수 없는 상태는 undefined — 호출처가 칩을
// 렌더하지 않는다(딜룸 페이지의 기존 `s ? <Chip/> : undefined` 동작 보존).
export function rfpStatusChip(status: string): StatusChip | undefined {
  return RFP_STATUS_CHIP[status as RfpStatus];
}

export type BuyerRfpProgress = { bidCount: number; reviewStatus?: PgReview['status'] };

// 구매사 진행 상태 칩 — 목록표와 딜룸 헤더(정식 페이지·@modal)가 같은 판정을 쓴다.
// 종결 상태 > 기한 마감 > 견적 도착 > 다음 PG 선택 > 검토 중 > 요청 완료 > 기본 칩.
// (이전엔 목록표만 진행 상황을 반영해 목록은 '견적 도착', 딜룸은 '요청 보냄'으로 어긋났다.)
export function buyerRfpChip(
  rfp: Pick<RFP, 'status' | 'deadline'>,
  progress: BuyerRfpProgress | undefined,
  nowMs = Date.now(),
): StatusChip & { action: string } {
  const nextPg = progress?.reviewStatus === 'rejected' || progress?.reviewStatus === 'withdrawn';
  if (rfp.status === 'sent' && !isRfpBidWindowOpen(rfp, nowMs)) return { label: '마감', color: 'surface', action: progress?.bidCount ? '견적 확인하기' : nextPg ? '다음 PG사 선택' : '결과 확인하기' };
  if (rfp.status === 'sent' && (progress?.bidCount || progress?.reviewStatus === 'quoted')) return { label: '견적 도착', color: 'tertiary', action: '견적 확인하기' };
  if (rfp.status === 'sent' && nextPg) return { label: '다음 PG사 선택', color: 'warning', action: '상담 이어가기' };
  if (rfp.status === 'sent' && progress?.reviewStatus === 'reviewing') return { label: 'PG 검토 중', color: 'warning', action: '상담 현황 보기' };
  if (rfp.status === 'sent' && progress?.reviewStatus === 'requested') return { label: '상담 요청 완료', color: 'primary', action: '상담 현황 보기' };
  return { ...RFP_STATUS_CHIP[rfp.status], action: rfp.status === 'awarded' ? '계약 확인하기' : rfp.status === 'sent' ? '요청 현황 보기' : '결과 보기' };
}

// PG 인박스/딜룸 요청 상태 칩 — 종결 상태 > 기한 마감 > 재요청 > 견적 보냄 > 신규 우선순위.
export function pgRequestChip(args: {
  status: RfpStatus;
  deadlinePassed: boolean;
  pendingRequote: boolean;
  hasBid: boolean;
  awardedToMe?: boolean;
}): StatusChip {
  if (args.status === 'cancelled') return RFP_STATUS_CHIP.cancelled;
  if (args.status === 'closed') return RFP_STATUS_CHIP.closed;
  if (args.status === 'awarded') {
    // '선정 마감'(딜룸 헤더 칩)은 RFP 라운드 종결을 가리키는 중립 표현 — 칸반/목록의 PG lost
    // 컬럼 라벨 '미선정'(개인 결과 버킷)과 의도적으로 다르다. 통일하지 말 것(승자 신원 비노출).
    return args.awardedToMe
      ? { label: '선정됨', color: 'tertiary' }
      : { label: '선정 마감', color: 'surface' };
  }
  if (args.deadlinePassed) return { label: '마감', color: 'surface' };
  if (args.pendingRequote) return { label: '재요청', color: 'warning' };
  if (args.hasBid) return { label: '견적 보냄', color: 'tertiary' };
  return { label: '신규', color: 'warning' };
}
