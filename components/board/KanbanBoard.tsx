'use client';

// Set to true to re-enable the custom-column UI (add/delete column controls).
const CUSTOM_COLUMNS_ENABLED = false;

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core';
import { generateKeyBetween } from 'fractional-indexing';
import { KanbanActionDialog } from '@/components/home/KanbanActionDialog';
import { useBoardDnd } from './useBoardDnd';
import { addColumnAction } from '@/lib/server/actions/board/addColumnAction';
import { deleteColumnAction } from '@/lib/server/actions/board/deleteColumnAction';
import { renameColumnAction } from '@/lib/server/actions/board/renameColumnAction';
import { recolorColumnAction } from '@/lib/server/actions/board/recolorColumnAction';
import { toast } from '@/lib/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  type BoardCard,
  type BoardColumn,
  type CardType,
  type ChipColorRole,
  type ColumnKind,
  isSystemColumn,
} from '@/lib/types/column';

type Props = {
  kind: ColumnKind;
  cardType: CardType;
  columns: BoardColumn[];
  cards: BoardCard[];
  renderCard: (card: BoardCard) => ReactNode;
  /**
   * 종결 컬럼처럼 무한 누적되는 컬럼의 노출 제한 — limit 초과분은 숨기고
   * "전체 N건 보기" 링크(표 뷰 딥링크)로 위임한다. null 이면 제한 없음.
   */
  columnOverflow?: (
    column: BoardColumn,
  ) => { limit: number; moreHref: string } | null;
};

const dotClass: Record<ChipColorRole, string> = {
  surface: 'bg-[var(--md-sys-color-outline-variant)]',
  primary: 'bg-[var(--md-sys-color-primary)]',
  tertiary: 'bg-[var(--md-sys-color-tertiary)]',
  warning: 'bg-[var(--md-sys-color-warning)]',
  error: 'bg-[var(--md-sys-color-error)]',
};

const COLOR_CHOICES: (ChipColorRole | null)[] = [
  null,
  'primary',
  'tertiary',
  'warning',
  'error',
];

export function KanbanBoard({
  kind,
  cardType,
  columns,
  cards,
  renderCard,
  columnOverflow,
}: Props) {
  const router = useRouter();
  // One column menu open at a time.
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const {
    sensors,
    grouped,
    pendingAction,
    clearPendingAction,
    activeCard,
    validDropTargets,
    handleDragStart,
    handleDragCancel,
    handleDragEnd,
  } = useBoardDnd({ cardType, columns, cards });

  const lastColumnPos = columns.length ? columns[columns.length - 1].position : null;

  return (
    <>
      <DndContext
        id={`board-${kind}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div
          role="region"
          aria-label="칸반 보드"
          // mandatory snap 은 드래그 자동 가로 스크롤과 충돌 — 평시 proximity,
          // 드래그 중에는 snap 자체를 끈다.
          className={cn(
            'flex gap-3 overflow-x-auto pb-4',
            !activeCard && 'snap-x snap-proximity',
          )}
        >
          {columns.map((column) => {
            const columnCards = grouped.get(column.id) ?? [];
            const overflow = columnOverflow?.(column) ?? null;
            const truncated = overflow !== null && columnCards.length > overflow.limit;
            const visibleCards = truncated
              ? columnCards.slice(0, overflow.limit)
              : columnCards;
            return (
              <ColumnView
                key={column.id}
                column={column}
                count={columnCards.length}
                dropState={
                  !activeCard
                    ? 'idle'
                    : validDropTargets?.has(column.id)
                      ? 'valid'
                      : 'invalid'
                }
                menuOpen={openMenu === column.id}
                onToggleMenu={() =>
                  setOpenMenu((prev) => (prev === column.id ? null : column.id))
                }
                onCloseMenu={() => setOpenMenu(null)}
                onRefresh={() => router.refresh()}
              >
                {visibleCards.map((card) => (
                  <DraggableCard key={card.cardId} card={card}>
                    {renderCard(card)}
                  </DraggableCard>
                ))}
                {truncated && (
                  <Link
                    href={overflow.moreHref}
                    className="block text-center py-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
                  >
                    전체 {columnCards.length}건 보기
                  </Link>
                )}
              </ColumnView>
            );
          })}
          {CUSTOM_COLUMNS_ENABLED && (
            <AddColumnControl
              kind={kind}
              afterPosition={lastColumnPos}
              onRefresh={() => router.refresh()}
            />
          )}
        </div>
        <DragOverlay>
          {activeCard ? (
            // 컬럼 w-72(288px) − p-3 양쪽(24px) = 카드 실폭 264px.
            <div className="w-[264px]">{renderCard(activeCard)}</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <KanbanActionDialog
        action={pendingAction}
        onClose={clearPendingAction}
        onCommitted={() => {
          clearPendingAction();
          router.refresh();
        }}
      />
    </>
  );
}

// 래퍼는 드래그 시작 리스너만 보유 — dnd-kit attributes(role/tabIndex)를 스프레드하면
// 카드 내부의 진짜 버튼과 중첩 버튼 시맨틱 + 이중 탭스톱이 생긴다. 시각 이동은
// DragOverlay 가 담당하므로 원본은 자리 placeholder 로만 남는다. touchAction 은
// 'manipulation' — TouchSensor 의 길게 누르기 활성화와 함께 세로 스크롤을 살린다.
function DraggableCard({ card, children }: { card: BoardCard; children: ReactNode }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.cardId}`,
    data: { card },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: 'manipulation' }}
      className={cn(isDragging && 'opacity-30')}
      {...listeners}
    >
      {children}
    </div>
  );
}

function ColumnView({
  column,
  count,
  dropState,
  children,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onRefresh,
}: {
  column: BoardColumn;
  count: number;
  /** 드래그 중 드롭 가능 여부 — invalid 컬럼은 dim, isOver 강조는 valid 만. */
  dropState: 'idle' | 'valid' | 'invalid';
  children: ReactNode;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRefresh: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });

  return (
    <section
      ref={setNodeRef}
      data-column-title={column.title}
      className={cn(
        'flex flex-col w-72 shrink-0 snap-start bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px] transition-[background-color,opacity]',
        dropState === 'invalid' && 'opacity-40',
        isOver &&
          dropState === 'valid' &&
          'bg-[var(--md-sys-color-surface-container-high)] outline outline-1 outline-dashed outline-[var(--md-sys-color-outline)]',
      )}
    >
      <header className="relative flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className={cn('inline-block h-2 w-2 rounded-full', dotClass[column.color ?? 'surface'])}
          />
          <span className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
            {column.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            {count}
          </span>
          <button
            type="button"
            aria-label={`${column.title} 컬럼 메뉴`}
            onClick={onToggleMenu}
            className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] text-[14px] leading-none px-1"
          >
            ⋯
          </button>
        </div>
        {menuOpen && (
          <ColumnMenu column={column} onClose={onCloseMenu} onRefresh={onRefresh} />
        )}
      </header>
      <div className="flex-1 flex flex-col gap-2">
        {count === 0 && (
          <p className="text-center py-8 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            —
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

function ColumnMenu({
  column,
  onClose,
  onRefresh,
}: {
  column: BoardColumn;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState(column.title);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast(`처리하지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      onClose();
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title="컬럼을 삭제할까요?"
        description="컬럼 안의 카드는 자동 분류로 되돌아갑니다."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={() => run(() => deleteColumnAction({ columnId: column.id }))}
        loading={busy}
      />
      <div className="absolute right-0 top-7 z-10 w-56 rounded-[var(--md-sys-shape-medium)] bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-2)] p-3 flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && title !== column.title)
              run(() => renameColumnAction({ columnId: column.id, title: title.trim() }));
            else onClose();
          }}
        >
          <input
            aria-label="컬럼 이름"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            className="w-full text-[13px] bg-[var(--md-sys-color-surface)] rounded-[var(--md-sys-shape-small)] px-2 py-1 border border-[var(--md-sys-color-outline-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/40"
          />
        </form>

        <div className="flex items-center gap-1.5">
          {COLOR_CHOICES.map((c) => (
            <button
              key={c ?? 'none'}
              type="button"
              aria-label={`색상 ${c ?? '없음'}`}
              disabled={busy}
              onClick={() => run(() => recolorColumnAction({ columnId: column.id, color: c }))}
              className={cn(
                'h-4 w-4 rounded-full border border-[var(--md-sys-color-outline-variant)]',
                dotClass[c ?? 'surface'],
              )}
            />
          ))}
        </div>

        {isSystemColumn(column) || !CUSTOM_COLUMNS_ENABLED ? (
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            기본 컬럼 — 삭제할 수 없습니다
          </p>
        ) : (
          <button
            type="button"
            aria-label="컬럼 삭제"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="text-left text-[12px] text-[var(--md-sys-color-error)] hover:underline"
          >
            컬럼 삭제
          </button>
        )}
      </div>
    </>
  );
}

function AddColumnControl({
  kind,
  afterPosition,
  onRefresh,
}: {
  kind: ColumnKind;
  afterPosition: string | null;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const position = generateKeyBetween(afterPosition, null);
      const r = await addColumnAction({ kind, title: title.trim(), position });
      if (!r.ok) {
        toast(`추가하지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      setTitle('');
      setOpen(false);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 w-44 self-start mt-0 rounded-[var(--md-sys-shape-medium)] border border-dashed border-[var(--md-sys-color-outline-variant)] text-[13px] text-[var(--md-sys-color-on-surface-variant)] py-3 hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
      >
        + 열 추가
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 w-72 bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3"
    >
      <input
        autoFocus
        aria-label="새 컬럼 이름"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        placeholder="컬럼 이름"
        className="w-full text-[13px] bg-[var(--md-sys-color-surface)] rounded-[var(--md-sys-shape-small)] px-2 py-1 border border-[var(--md-sys-color-outline-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/40"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] px-2 py-1"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="text-[12px] text-[var(--md-sys-color-primary)] px-2 py-1 disabled:opacity-40"
        >
          {busy ? 'LOADING…' : '추가'}
        </button>
      </div>
    </form>
  );
}

// Named export so Server Components can render the skeleton across the RSC
// boundary (a static on a 'use client' component resolves to undefined there).
export function KanbanBoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col w-72 shrink-0 bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px]"
        >
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-4" />
          </div>
          {i < 2 &&
            Array.from({ length: 2 }).map((_, j) => (
              <Skeleton key={j} className="h-[80px] rounded-[var(--md-sys-shape-medium)] mb-2" />
            ))}
        </div>
      ))}
    </div>
  );
}

KanbanBoard.Skeleton = KanbanBoardSkeleton;
