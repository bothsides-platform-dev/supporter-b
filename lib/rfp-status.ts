import type { ChipColor } from '@/components/primitives/Chip';
import type { RfpStatus } from '@/lib/types/rfp';

// 견적 상태/요청 칩의 단일 출처 — 정식 딜룸 페이지, @modal 인터셉트, 목록표가 공유한다.
// (이전엔 STATUS 맵이 rfp/[id]·rfp/@modal 에 중복 + RfpListTable 에 statusLabel/statusColor
// 로 3중 복제돼 손으로 동기화해야 했다.)

export type StatusChip = { label: string; color: ChipColor };

// RfpStatus 전체를 매핑 — 키가 빠지면 컴파일 에러로 잡힌다.
export const RFP_STATUS_CHIP: Record<RfpStatus, StatusChip> = {
  draft: { label: '임시저장', color: 'surface' },
  sent: { label: '요청 보냄', color: 'warning' },
  closed: { label: '마감', color: 'surface' },
  awarded: { label: '선정 완료', color: 'tertiary' },
  cancelled: { label: '취소', color: 'error' },
};

// 문자열 상태를 받아 칩을 돌려준다. 알 수 없는 상태는 undefined — 호출처가 칩을
// 렌더하지 않는다(딜룸 페이지의 기존 `s ? <Chip/> : undefined` 동작 보존).
export function rfpStatusChip(status: string): StatusChip | undefined {
  return RFP_STATUS_CHIP[status as RfpStatus];
}

// PG 인박스/딜룸 요청 상태 칩 — 선정 종료 > 재요청 > 견적 보냄 > 신규 우선순위.
export function pgRequestChip(args: {
  pendingRequote: boolean;
  hasBid: boolean;
  awarded?: boolean;
  awardedToMe?: boolean;
}): StatusChip {
  if (args.awarded) {
    return args.awardedToMe
      ? { label: '선정됨', color: 'tertiary' }
      : { label: '선정 마감', color: 'surface' };
  }
  if (args.pendingRequote) return { label: '재요청', color: 'warning' };
  if (args.hasBid) return { label: '견적 보냄', color: 'tertiary' };
  return { label: '신규', color: 'warning' };
}
