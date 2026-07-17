import { Chip, type ChipColor } from '@/components/primitives/Chip';
import type { ContractDocStatus } from '@/lib/types/contract-doc';

export type ContractStatusChipProps = {
  status: ContractDocStatus;
  mySignPending: boolean;
};

type NonSentStatus = Exclude<ContractDocStatus, 'sent'>;

// 발송 후 종결 상태 라벨 — UX_WRITING.md §8 계약 도메인 용어 확정('체결'·'날인' 금지).
const STATIC_META: Record<NonSentStatus, { color: ChipColor; label: string }> = {
  completed: { color: 'tertiary', label: '서명 완료' },
  declined: { color: 'error', label: '반려' },
  canceled: { color: 'error', label: '회수' },
  expired: { color: 'surface', label: '기한 만료' },
};

/** 계약 문서 상태 → Chip 순수 매핑. sent 는 내 서명 대기 여부로 문구가 갈린다. */
export function ContractStatusChip({ status, mySignPending }: ContractStatusChipProps) {
  if (status === 'sent') {
    return mySignPending ? (
      <Chip color="warning" label="서명 대기" />
    ) : (
      <Chip color="surface" label="상대 서명 대기" />
    );
  }
  const { color, label } = STATIC_META[status];
  return <Chip color={color} label={label} />;
}
