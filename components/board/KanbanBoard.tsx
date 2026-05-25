'use client';

import { useMemo, useOptimistic, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { generateKeyBetween } from 'fractional-indexing';
import { KanbanActionDialog } from '@/components/home/KanbanActionDialog';
import type { DragAction } from '@/components/home/dragMatrix';
import { resolveBoardDrop } from './resolveBoardDrop';
import { moveCardAction } from '@/lib/server/actions/board/moveCardAction';
import { releaseCardAction } from '@/lib/server/actions/board/releaseCardAction';
import { addColumnAction } from '@/lib/server/actions/board/addColumnAction';
import { deleteColumnAction } from '@/lib/server/actions/board/deleteColumnAction';
import { renameColumnAction } from '@/lib/server/actions/board/renameColumnAction';
import { recolorColumnAction } from '@/lib/server/actions/board/recolorColumnAction';
import { DEFAULT_LANDING_KEY } from '@/lib/server/columns/lifecycle-keys';
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

export function KanbanBoard({ kind, cardType, columns, cards, renderCard }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<DragAction | null>(null);
  // One column menu open at a time.
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Optimistic column override per card (the server truth lands via refresh()).
  const [overrides, applyOverride] = useOptimistic<
    Record<string, string>,
    { cardId: string; columnId: string }
  >({}, (state, patch) => ({ ...state, [patch.cardId]: patch.columnId }));

  const columnOf = (c: BoardCard): string => overrides[c.cardId] ?? c.columnId;

  const grouped = useMemo(() => {
    const m = new Map<string, BoardCard[]>();
    for (const col of columns) m.set(col.id, []);
    for (const card of cards) {
      const list = m.get(columnOf(card));
      if (list) list.push(card);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, columns, overrides]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commitPlace = (card: BoardCard, toColumn: BoardColumn) => {
    startTransition(async () => {
      applyOverride({ cardId: card.cardId, columnId: toColumn.id });
      const r = await moveCardAction({
        cardType,
        cardId: card.cardId,
        toColumnId: toColumn.id,
      });
      if (!r.ok) toast(`이동 실패 — ${r.error}`, { type: 'error' });
      router.refresh();
    });
  };

  const commitRelease = (card: BoardCard) => {
    const wantKey =
      cardType === 'bid' ? DEFAULT_LANDING_KEY : (card.payload as { stage?: string }).stage;
    const target = columns.find((c) => c.lifecycleKey === wantKey);
    startTransition(async () => {
      if (target) applyOverride({ cardId: card.cardId, columnId: target.id });
      const r = await releaseCardAction({ cardType, cardId: card.cardId });
      if (!r.ok) toast(`이동 실패 — ${r.error}`, { type: 'error' });
      router.refresh();
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    let toColumnId: string | undefined;
    if (overId.startsWith('column:')) {
      toColumnId = overId.slice('column:'.length);
    } else if (overId.startsWith('card:')) {
      const overCard = cards.find((c) => `card:${c.cardId}` === overId);
      toColumnId = overCard ? columnOf(overCard) : undefined;
    }
    if (!toColumnId) return;

    const cardId = overId === '' ? '' : String(active.id).slice('card:'.length);
    const card = cards.find((c) => c.cardId === cardId);
    const toColumn = columns.find((c) => c.id === toColumnId);
    if (!card || !toColumn) return;
    if (columnOf(card) === toColumn.id) return; // no-op

    const drop = resolveBoardDrop({ cardType, toColumn, payload: card.payload as object });
    switch (drop.kind) {
      case 'reject':
        toast('이 컬럼으로는 이동할 수 없습니다.', { type: 'info' });
        return;
      case 'lifecycle':
        setPendingAction(drop.action);
        return;
      case 'place':
        commitPlace(card, toColumn);
        return;
      case 'release':
        commitRelease(card);
        return;
    }
  };

  const lastColumnPos = columns.length ? columns[columns.length - 1].position : null;

  return (
    <>
      <DndContext
        id={`board-${kind}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div
          role="region"
          aria-label="칸반 보드"
          className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory"
        >
          {columns.map((column) => (
            <ColumnView
              key={column.id}
              column={column}
              count={(grouped.get(column.id) ?? []).length}
              menuOpen={openMenu === column.id}
              onToggleMenu={() =>
                setOpenMenu((prev) => (prev === column.id ? null : column.id))
              }
              onCloseMenu={() => setOpenMenu(null)}
              onRefresh={() => router.refresh()}
            >
              {(grouped.get(column.id) ?? []).map((card) => (
                <DraggableCard key={card.cardId} card={card}>
                  {renderCard(card)}
                </DraggableCard>
              ))}
            </ColumnView>
          ))}
          <AddColumnControl
            kind={kind}
            afterPosition={lastColumnPos}
            onRefresh={() => router.refresh()}
          />
        </div>
      </DndContext>

      <KanbanActionDialog
        action={pendingAction}
        onClose={() => setPendingAction(null)}
        onCommitted={() => {
          setPendingAction(null);
          router.refresh();
        }}
      />
    </>
  );
}

function DraggableCard({ card, children }: { card: BoardCard; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card:${card.cardId}`,
    data: { card },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function ColumnView({
  column,
  count,
  children,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onRefresh,
}: {
  column: BoardColumn;
  count: number;
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
        'flex flex-col w-72 shrink-0 snap-start bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px] transition-colors',
        isOver &&
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
        toast(`실패 — ${r.error}`, { type: 'error' });
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

        {isSystemColumn(column) ? (
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
        toast(`추가 실패 — ${r.error}`, { type: 'error' });
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
