'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import Link from 'next/link';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { BidBoardCard } from './BidBoardCard';
import { cn } from '@/lib/utils';
import type { Bid, BuyerStage } from '@/lib/types/bid';
import { BUYER_STAGE_LABEL } from '@/lib/types/bid';

const stageChipColor: Record<BuyerStage, ChipColor> = {
  pending: 'surface',
  negotiating: 'warning',
  decided: 'tertiary',
};

type Props = {
  stage: BuyerStage;
  bids: Bid[];
  pgName: (wsId: string) => string;
  onCardClick: (bidId: string) => void;
  onMoveStage: (bidId: string, to: BuyerStage) => void;
  noteCounts: Record<string, number>;
  awardedBidId?: string;
  canAward: boolean;
  rfpId: string;
  disabled: boolean;
};

export function BidBoardColumn({
  stage,
  bids,
  pgName,
  onCardClick,
  onMoveStage,
  noteCounts,
  awardedBidId,
  canAward,
  rfpId,
  disabled,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage, disabled });

  const showAwardCta = stage === 'decided' && canAward && bids.length === 1;
  const awardDisabled = stage === 'decided' && canAward && bids.length > 1;

  return (
    <div
      ref={setNodeRef}
      data-stage={stage}
      className={cn(
        'flex flex-col min-h-[200px] rounded-md transition-colors',
        isOver
          ? 'bg-[var(--md-sys-color-surface-container-high)] outline outline-1 outline-dashed outline-[var(--md-sys-color-outline)]'
          : 'bg-transparent',
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between gap-2 px-1 pb-3 mb-3 border-b border-[var(--md-sys-color-outline-variant)]">
        <div className="flex items-center gap-2">
          <Chip label={BUYER_STAGE_LABEL[stage]} color={stageChipColor[stage]} />
          <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            {String(bids.length).padStart(2, '0')}
          </span>
        </div>
        {showAwardCta && (
          <Link
            href={`/rfp/${rfpId}/award?bidId=${bids[0].id}`}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface)] hover:underline"
          >
            수주 처리 →
          </Link>
        )}
        {awardDisabled && (
          <span
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] cursor-help"
            title="결정 카드 중 1개를 선택해 카드 메뉴에서 수주 처리하세요"
          >
            수주 처리 →
          </span>
        )}
      </div>

      {/* Cards */}
      <SortableContext
        items={bids.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-3 px-1 pb-2 min-h-[80px]">
          {bids.map((bid, i) => (
            <BidBoardCard
              key={bid.id}
              bid={bid}
              pgName={pgName(bid.pgWsId)}
              stage={stage}
              serial={i + 1}
              noteCount={noteCounts[bid.id] ?? 0}
              isAwarded={awardedBidId === bid.id}
              canAward={canAward}
              rfpId={rfpId}
              onClick={() => onCardClick(bid.id)}
              onMoveStage={(to) => onMoveStage(bid.id, to)}
              disabled={disabled || awardedBidId === bid.id}
            />
          ))}
          {bids.length === 0 && (
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] py-6 text-center">
              —
            </p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
