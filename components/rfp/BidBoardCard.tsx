'use client';

import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { IconButton } from '@/components/primitives/IconButton';
import { MoreHorizontalIcon, FileTextIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { Bid, BuyerStage } from '@/lib/types/bid';
import {
  BUYER_STAGE_ORDER,
  BUYER_STAGE_LABEL,
} from '@/lib/types/bid';
import { formatKRW, formatPct } from '@/lib/format';

const SETTLE_LABEL: Record<string, string> = {
  'D+0': 'D+0',
  'D+1': 'D+1',
  'D+2': 'D+2',
  weekly: '주1회',
  monthly: '월1회',
};

const stageChipColor: Record<BuyerStage, ChipColor> = {
  pending: 'surface',
  negotiating: 'warning',
  decided: 'tertiary',
};

type Props = {
  bid: Bid;
  pgName: string;
  stage: BuyerStage;
  serial: number; // 1-based within the column
  noteCount: number;
  isAwarded: boolean;
  canAward: boolean;
  rfpId: string;
  onClick: () => void;
  onMoveStage: (to: BuyerStage) => void;
  disabled: boolean;
};

export function BidBoardCard({
  bid,
  pgName,
  stage,
  serial,
  noteCount,
  isAwarded,
  canAward,
  rfpId,
  onClick,
  onMoveStage,
  disabled,
}: Props) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bid.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const hasPdf = bid.proposalPdfs.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-md',
        'transition-shadow hover:shadow-[0_2px_8px_-4px_rgba(20,18,15,0.08)]',
        'cursor-pointer',
        isAwarded &&
          "before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-[var(--md-sys-color-tertiary)] before:rounded-r",
        isDragging && 'shadow-lg',
      )}
    >
      {/* Drag handle area — body */}
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left p-4 cursor-pointer"
        {...attributes}
        {...listeners}
        aria-roledescription="제안 카드, 드래그 가능"
      >
        {/* Top row: PG name */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)] truncate">
            {pgName}
          </span>
          {/* Spacer for menu button */}
          <span className="w-7 shrink-0" aria-hidden />
        </div>

        {/* Stage + serial */}
        <div className="flex items-center gap-2 mb-3">
          {isAwarded ? (
            <Chip label="수주" color="tertiary" />
          ) : (
            <Chip label={BUYER_STAGE_LABEL[stage]} color={stageChipColor[stage]} />
          )}
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] tabular-nums ml-auto">
            {String(serial).padStart(2, '0')}
          </span>
        </div>

        {/* KPIs — 3 lines. Use <div>/<span> not <dl>/<dt>/<dd>: this block
            renders inside a <button>, and definition-list elements are flow
            content (invalid as button descendants). */}
        <div className="space-y-1.5">
          <KpiLine label="정산" value={SETTLE_LABEL[bid.settleCycle] ?? bid.settleCycle} />
          <KpiLine label="월최저" value={formatKRW(bid.monthlyMin)} />
          <KpiLine label="간편결제" value={formatPct(bid.easyPayFeePct)} />
        </div>

        {/* Footer: PDF + note count */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
          {hasPdf ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)]">
              <FileTextIcon size={12} /> PDF
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-outline)]">
              제안서 없음
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            메모 {noteCount}
          </span>
        </div>
      </button>

      {/* Menu — absolutely positioned over the body, but listeners NOT inherited */}
      <div
        className="absolute top-2 right-2"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <IconButton label={`${pgName} 메뉴`} size="sm">
                <MoreHorizontalIcon size={16} />
              </IconButton>
            }
          />
          <DropdownMenuContent align="end" sideOffset={4}>
            {BUYER_STAGE_ORDER.filter((s) => s !== stage).map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={disabled}
                onClick={() => onMoveStage(s)}
              >
                <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] mr-2">
                  →
                </span>
                {BUYER_STAGE_LABEL[s]}으로
              </DropdownMenuItem>
            ))}
            {stage === 'decided' && canAward && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={
                    <a href={`/rfp/${rfpId}/award?bidId=${bid.id}`}>
                      수주 처리 →
                    </a>
                  }
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
