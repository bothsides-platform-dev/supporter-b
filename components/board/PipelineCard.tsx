'use client';

import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { formatDeadline } from '@/lib/format';
import type { BoardCard } from '@/lib/types/column';
import type { BuyerKanbanCard } from '@/lib/server/buyer-kanban';
import type { PgKanbanCard } from '@/lib/server/pg-kanban';
import { useRecentlyViewedInbox } from '@/lib/stores/recently-viewed-inbox';

// Presentational pipeline card (RFP for buyer / invitation for pg) for the
// unified board's renderCard slot. Drag is handled by the board's DraggableCard
// wrapper, so this is body-only.
function ddayChipColor(deadline: string): ChipColor {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'error';
  if (days <= 3) return 'warning';
  return 'surface';
}

export function PipelineCard({
  card,
  onSelect,
}: {
  card: BoardCard;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full text-left bg-[var(--md-sys-color-surface-container-low)] shadow-[var(--md-sys-elevation-1)] rounded-[var(--md-sys-shape-medium)] p-3 hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,var(--md-sys-color-surface-container-low))] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
    >
      {card.cardType === 'rfp' ? (
        <BuyerBody card={card.payload as BuyerKanbanCard} />
      ) : (
        <PgBody card={card.payload as PgKanbanCard} />
      )}
    </button>
  );
}

function CardHead({ code, deadline, hideDday }: { code: string; deadline: string; hideDday: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
      <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] tracking-[0.04em]">
        {code}
      </span>
      {!hideDday && <Chip label={formatDeadline(deadline)} color={ddayChipColor(deadline)} />}
    </div>
  );
}

function BuyerBody({ card }: { card: BuyerKanbanCard }) {
  // 결과 컬럼(선정 완료/마감) 카드의 D-day 는 노이즈 — PgBody 와 동일 규칙으로 숨김.
  const isResult = card.stage === 'awarded' || card.stage === 'closed';
  return (
    <div className="space-y-2">
      <CardHead code={card.rfpId} deadline={card.deadline} hideDday={isResult} />
      {(card.isCancelled || card.isSample) && (
        // 두 칩이 동시 렌더될 수 있어(취소된 샘플) 한 행으로 묶어 간격을 보장한다.
        <div className="flex flex-wrap gap-1">
          {card.isCancelled && <Chip label="취소됨" color="error" />}
          {card.isSample && <Chip label="샘플" color="surface" />}
        </div>
      )}
      <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)] line-clamp-2">
        {card.title}
      </p>
      {card.invitedPgCount > 0 && (
        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            초대 PG<span className="font-mono tabular-nums ml-1">{card.invitedPgCount}</span>
          </span>
          <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            견적 {card.submittedBidCount}/{card.invitedPgCount}
          </span>
        </div>
      )}
    </div>
  );
}

function PgBody({ card }: { card: PgKanbanCard }) {
  const isResult = card.stage === 'won' || card.stage === 'lost';
  const isViewed = useRecentlyViewedInbox((s) => s.isViewed);
  const showRecentBadge = card.stage === 'received' && isViewed(card.rfpId);
  return (
    <div className="space-y-2">
      <CardHead code={card.rfpId} deadline={card.deadline} hideDday={isResult} />
      {/* 재요청은 재제출로만 resolve — 종결(won/lost) 후엔 응답 불가라 칩을 숨긴다. */}
      {card.hasPendingRequote && !isResult && <Chip label="재요청" color="warning" />}
      {showRecentBadge && <Chip label="최근 조회" color="surface" />}
      {card.buyerName && (
        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          {card.buyerName}
        </p>
      )}
      <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)] line-clamp-2">
        {card.title}
      </p>
      {card.bizGradeLabel && (
        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            가맹점 등급 <span className="font-medium ml-1">{card.bizGradeLabel}</span>
          </span>
        </div>
      )}
    </div>
  );
}
