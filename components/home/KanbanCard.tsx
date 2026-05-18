'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { formatDeadline } from '@/lib/format';
import type {
  BuyerKanbanCard as BuyerCard,
  BuyerKanbanStage,
} from '@/lib/server/buyer-kanban';
import type {
  PgKanbanCard as PgCard,
  PgKanbanStage,
} from '@/lib/server/pg-kanban';

const FROZEN_BUYER: ReadonlySet<BuyerKanbanStage> = new Set([
  'awarded',
  'closed',
]);
const FROZEN_PG: ReadonlySet<PgKanbanStage> = new Set(['won', 'lost']);

type Props =
  | { role: 'buyer'; card: BuyerCard; onSelect: () => void }
  | { role: 'pg'; card: PgCard; onSelect: () => void };

function ddayChipColor(deadline: string): ChipColor {
  const days = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return 'error';
  if (days <= 3) return 'warning';
  return 'surface';
}

export function KanbanCard(props: Props) {
  const cardId =
    props.role === 'buyer'
      ? `card:${props.card.rfpId}`
      : `card:${props.card.invitationId}`;

  const frozen =
    props.role === 'buyer'
      ? FROZEN_BUYER.has(props.card.stage)
      : FROZEN_PG.has(props.card.stage);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: cardId,
      disabled: frozen,
      data: { card: props.card, role: props.role },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // dnd-kit pointer activation 4px 안에서는 click 이 통과 — 그 안에서만 모달 오픈.
        if (!isDragging) props.onSelect();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      className="block w-full text-left bg-[var(--md-sys-color-surface-container-low)] shadow-[var(--md-sys-elevation-1)] rounded-[var(--md-sys-shape-medium)] p-3 hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,var(--md-sys-color-surface-container-low))] active:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_12%,var(--md-sys-color-surface-container-low))] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
    >
      {props.role === 'buyer' ? (
        <BuyerCardBody card={props.card} />
      ) : (
        <PgCardBody card={props.card} />
      )}
    </div>
  );
}

function BuyerCardBody({ card }: { card: BuyerCard }) {
  const dday = formatDeadline(card.deadline);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] tracking-[0.04em]">
          {card.rfpId}
        </span>
        {card.stage === 'draft' ? null : (
          <Chip label={dday} color={ddayChipColor(card.deadline)} />
        )}
      </div>
      <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)] line-clamp-2">
        {card.title}
      </p>
      {card.invitedPgCount > 0 && (
        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            초대 PG
            <span className="font-mono tabular-nums ml-1">
              {card.invitedPgCount}
            </span>
          </span>
          <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            응답 {card.submittedBidCount}/{card.invitedPgCount}
          </span>
        </div>
      )}
    </div>
  );
}

function PgCardBody({ card }: { card: PgCard }) {
  const isResultColumn = card.stage === 'won' || card.stage === 'lost';
  const dday = formatDeadline(card.deadline);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] tracking-[0.04em]">
          {card.rfpId}
        </span>
        {!isResultColumn && (
          <Chip label={dday} color={ddayChipColor(card.deadline)} />
        )}
      </div>
      <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)] line-clamp-2">
        {card.title}
      </p>
      {card.bizGradeLabel && (
        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            가맹점 등급{' '}
            <span className="font-medium ml-1">{card.bizGradeLabel}</span>
          </span>
        </div>
      )}
    </div>
  );
}
