'use client';

// 포커스 비교 상단 탭 스트립 — PG 당 탭(선정/재요청/N차 칩) + hover peek 패널.
// 표현 전용; 상태(active/peek/tier)는 부모가 소유하고 콜백으로 전달한다. memo 로
// 감싸 hover/탭 전환 시 본문(요율 표·아코디언) 재렌더를 막는다.
import { memo } from 'react';
import { Chip } from '@/components/primitives/Chip';
import { getMethodRate, type Bid, type MerchantTier } from '@/lib/types/bid';
import { formatKRW, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';

type RequoteByPg = Record<string, { status: 'pending' | 'responded'; round: number; deadline: string }>;

function BidTabStripImpl({
  sortedBids,
  activeId,
  awardedBidId,
  isAwarded,
  requoteByPg,
  tier,
  peek,
  pgName,
  onSelect,
  onPeekEnter,
  onPeekLeave,
}: {
  sortedBids: Bid[];
  activeId: string;
  awardedBidId?: string | null;
  isAwarded: boolean;
  requoteByPg?: RequoteByPg;
  tier: MerchantTier;
  peek: Bid | null;
  pgName: (wsId: string) => string;
  onSelect: (bidId: string) => void;
  onPeekEnter: (bidId: string) => void;
  onPeekLeave: (bidId: string) => void;
}) {
  return (
    <div className="relative">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--md-sys-color-outline-variant)]">
        {sortedBids.map((bid) => {
          const isActive = bid.id === activeId;
          const isWinner = isAwarded && bid.id === awardedBidId;
          return (
            <button
              key={bid.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onSelect(bid.id)}
              onMouseEnter={() => onPeekEnter(bid.id)}
              onMouseLeave={() => onPeekLeave(bid.id)}
              className={cn(
                'relative flex items-center gap-2 px-3 h-9 text-[13px] transition-colors cursor-pointer',
                isActive
                  ? 'text-[var(--md-sys-color-on-surface)] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-[var(--md-sys-color-primary)]'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
              )}
            >
              {pgName(bid.pgWsId)}
              {isAwarded && (
                <Chip
                  label={isWinner ? '선정' : '미선정'}
                  color={isWinner ? 'tertiary' : 'surface'}
                />
              )}
              {!isAwarded && requoteByPg?.[bid.pgWsId] && (
                <Chip
                  label={
                    requoteByPg[bid.pgWsId]!.status === 'pending'
                      ? '재요청함 · 응답대기'
                      : '재제출됨'
                  }
                  color={requoteByPg[bid.pgWsId]!.status === 'pending' ? 'warning' : 'tertiary'}
                />
              )}
              {bid.round > 1 && <Chip label={`${bid.round}차`} color="surface" />}
            </button>
          );
        })}
      </div>

      {/* Hover peek */}
      {peek && peek.id !== activeId && (
        <div className="absolute z-20 mt-1 rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 shadow-md">
          <p className="text-[12px] font-[600] text-[var(--md-sys-color-on-surface)] mb-1.5">
            {pgName(peek.pgWsId)}
          </p>
          <dl className="space-y-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            <PeekRow
              label="카드"
              value={(() => {
                const r = getMethodRate(peek.paymentFees.card, tier);
                return r !== undefined ? formatPct(r) : '—';
              })()}
            />
            <PeekRow label="정산주기" value={peek.settleCycle} />
            <PeekRow label="정산한도" value={formatKRW(peek.settleLimit)} />
          </dl>
        </div>
      )}
    </div>
  );
}

function PeekRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt>{label}</dt>
      <dd className="md-numeric text-[var(--md-sys-color-on-surface)]">{value}</dd>
    </div>
  );
}

export const BidTabStrip = memo(BidTabStripImpl);
