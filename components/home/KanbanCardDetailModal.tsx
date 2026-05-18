'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { formatDate, formatDeadline } from '@/lib/format';
import {
  BUYER_KANBAN_LABEL,
  type BuyerKanbanCard,
  type BuyerKanbanStage,
} from '@/lib/server/buyer-kanban';
import {
  PG_KANBAN_LABEL,
  type PgKanbanCard,
  type PgKanbanStage,
} from '@/lib/server/pg-kanban';

const buyerStageColor: Record<BuyerKanbanStage, ChipColor> = {
  draft: 'surface',
  sent: 'primary',
  collecting: 'warning',
  comparing: 'primary',
  awarded: 'tertiary',
  closed: 'error',
};

const pgStageColor: Record<PgKanbanStage, ChipColor> = {
  received: 'surface',
  reviewing: 'warning',
  drafting: 'primary',
  submitted: 'warning',
  won: 'tertiary',
  lost: 'error',
};

type Props =
  | {
      role: 'buyer';
      card: BuyerKanbanCard | null;
      onOpenChange: (open: boolean) => void;
    }
  | {
      role: 'pg';
      card: PgKanbanCard | null;
      onOpenChange: (open: boolean) => void;
    };

export function KanbanCardDetailModal(props: Props) {
  const open = props.card !== null;
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        {props.card && props.role === 'buyer' && (
          <BuyerBody card={props.card} />
        )}
        {props.card && props.role === 'pg' && <PgBody card={props.card} />}
      </DialogContent>
    </Dialog>
  );
}

function BuyerBody({ card }: { card: BuyerKanbanCard }) {
  const dday = formatDeadline(card.deadline);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-[11px] tabular-nums tracking-[0.04em] text-[var(--md-sys-color-on-surface-variant)]">
            {card.rfpId}
          </span>
          <DialogTitle className="text-[18px] font-[600] tracking-[-0.01em] text-[var(--md-sys-color-on-surface)] mt-1">
            {card.title}
          </DialogTitle>
        </div>
        <Chip
          label={BUYER_KANBAN_LABEL[card.stage]}
          color={buyerStageColor[card.stage]}
        />
      </div>
      <DialogDescription className="sr-only">RFP 상세</DialogDescription>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2">
        <Field label="마감" value={`${dday} · ${formatDate(card.deadline)}`} />
        <Field label="작성일" value={formatDate(card.createdAt)} />
        <Field label="초대 PG" value={`${card.invitedPgCount}개`} />
        <Field
          label="응답 수"
          value={`${card.submittedBidCount} / ${card.invitedPgCount}`}
        />
      </dl>

      <div className="flex justify-end gap-2 mt-2">
        <Link href={`/rfp/${card.rfpId}`}>
          <Button size="sm">상세 페이지로 →</Button>
        </Link>
      </div>
    </>
  );
}

function PgBody({ card }: { card: PgKanbanCard }) {
  const dday = formatDeadline(card.deadline);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-[11px] tabular-nums tracking-[0.04em] text-[var(--md-sys-color-on-surface-variant)]">
            {card.rfpId}
          </span>
          <DialogTitle className="text-[18px] font-[600] tracking-[-0.01em] text-[var(--md-sys-color-on-surface)] mt-1">
            {card.title}
          </DialogTitle>
        </div>
        <Chip
          label={PG_KANBAN_LABEL[card.stage]}
          color={pgStageColor[card.stage]}
        />
      </div>
      <DialogDescription className="sr-only">초대받은 RFP 상세</DialogDescription>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2">
        <Field label="마감" value={`${dday} · ${formatDate(card.deadline)}`} />
        {card.bizGradeLabel && (
          <Field label="가맹점 등급" value={card.bizGradeLabel} />
        )}
        {card.submittedAt && (
          <Field label="제출일" value={formatDate(card.submittedAt)} />
        )}
      </dl>

      <div className="flex justify-end gap-2 mt-2">
        <Link href={`/inbox/${card.rfpId}`}>
          <Button size="sm">상세 페이지로 →</Button>
        </Link>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </dt>
      <dd className="font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)] mt-0.5">
        {value}
      </dd>
    </div>
  );
}
