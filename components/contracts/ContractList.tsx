import Link from 'next/link';
import { EmptyState } from '@/components/primitives/EmptyState';
import { LocalDate } from '@/components/primitives/LocalTime';
import { FileSignatureIcon } from '@/components/icons';
import { ContractStatusChip } from './ContractStatusChip';
import type { ContractDocListEntry } from '@/lib/server/contract-loader';

export type ContractListProps = {
  items: ContractDocListEntry[];
};

/** /contracts 목록 — 행 클릭 시 상세로 이동. */
export function ContractList({ items }: ContractListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileSignatureIcon size={40} />}
        title="아직 전자계약이 없어요"
        description="선정된 견적에서 계약서를 보내면 여기에 표시돼요."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/contracts/${item.id}`}
            className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="md-numeric shrink-0 text-[13px] text-[var(--md-sys-color-on-surface)]">
                {item.code}
              </span>
              <span className="truncate text-[13px] text-[var(--md-sys-color-on-surface)]">
                {item.title}
              </span>
              <span className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                {item.counterpartyName}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <ContractStatusChip status={item.status} mySignPending={item.mySignPending} />
              <span className="md-numeric text-[11px] text-[var(--md-sys-color-outline)]">
                <LocalDate iso={item.sentAt} />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
