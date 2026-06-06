'use client';

import { Chip } from '@/components/primitives/Chip';
import { FileTextIcon } from '@/components/icons';
import { CounterpartyProfileCard } from '@/components/messages/CounterpartyProfileCard';
import { formatKRW, formatPct } from '@/lib/format';
import { PAYMENT_METHOD_LABELS, type Bid, type PaymentMethod } from '@/lib/types/bid';

// Presentational bid card for the rfp_bids board's renderCard slot. Drag is the
// board's DraggableCard wrapper; awarded state shows a "선정됨" chip (decoupled
// from columns — see spec §A). Click opens the detail modal.
export function BidCard({
  bid,
  pgName,
  isAwarded,
  noteCount,
  onClick,
}: {
  bid: Bid;
  pgName: string;
  isAwarded: boolean;
  noteCount: number;
  onClick: () => void;
}) {
  const hasPdf = bid.proposalPdfs.length > 0;
  // 제출한 enum 결제수단 요율을 요약(카드 teaser라 최대 3개). 커스텀은 상세 모달/표에서.
  const feeLines = (Object.entries(bid.paymentFees) as [PaymentMethod, number][]).slice(0, 3);
  // 카드 본문 클릭은 상세 모달을 연다. PG명은 프로필 카드(자체 버튼)라 버튼 중첩을 피하려
  // 카드 루트를 role="button" div 로 두고 키보드 활성화를 직접 처리한다.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="block w-full text-left bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-md p-4 transition-shadow hover:shadow-[0_2px_8px_-4px_rgba(20,18,15,0.08)] cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <CounterpartyProfileCard
          variant="profile"
          counterparty={{ name: pgName, type: 'pg', workspaceId: bid.pgWsId }}
        />
        {isAwarded && <Chip label="선정됨" color="tertiary" />}
      </div>

      <div className="space-y-1.5">
        <KpiLine label="정산" value={bid.settleCycle} />
        <KpiLine label="정산한도" value={formatKRW(bid.settleLimit)} />
        {feeLines.map(([method, fee]) => (
          <KpiLine key={method} label={PAYMENT_METHOD_LABELS[method]} value={formatPct(fee)} />
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
        {hasPdf ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)]">
            <FileTextIcon size={12} /> PDF
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-outline)]">
            견적서 없음
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          메모 {noteCount}
        </span>
      </div>
    </div>
  );
}

function KpiLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <span className="font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface)]">
        {value}
      </span>
    </div>
  );
}
