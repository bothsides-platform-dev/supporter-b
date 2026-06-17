'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, closestCorners } from '@dnd-kit/core';
import { KanbanActionDialog } from '@/components/home/KanbanActionDialog';
import { useBoardDnd } from './useBoardDnd';
import { BoardColumn, AddColumnControl, CUSTOM_COLUMNS_ENABLED } from './BoardColumn';
import { BoardDragOverlay } from './BoardDragOverlay';
import { buildBoardAnnouncements, boardScreenReaderInstructions } from './boardAnnouncements';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  type BoardCard,
  type BoardColumn as BoardColumnType,
  type CardType,
  type ColumnKind,
} from '@/lib/types/column';

type Props = {
  kind: ColumnKind;
  cardType: CardType;
  columns: BoardColumnType[];
  cards: BoardCard[];
  renderCard: (card: BoardCard) => ReactNode;
  /**
   * 종결 컬럼처럼 무한 누적되는 컬럼의 노출 제한 — limit 초과분은 숨기고
   * "표에서 전체 보기" 링크(표 뷰 딥링크)로 위임한다. null 이면 제한 없음.
   */
  columnOverflow?: (
    column: BoardColumnType,
  ) => { limit: number; moreHref: string } | null;
};

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

  const toggleMenu = useCallback(
    (columnId: string) =>
      setOpenMenu((prev) => (prev === columnId ? null : columnId)),
    [],
  );
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const refresh = useCallback(() => router.refresh(), [router]);

  // dnd-kit 의 관리형 aria-live 영역에 도메인 문구를 주입 — 컬럼 id → 제목 해석.
  const announcements = useMemo(() => {
    const titleById = new Map(columns.map((c) => [c.id, c.title]));
    return buildBoardAnnouncements({ columnTitle: (id) => titleById.get(id) ?? null });
  }, [columns]);

  // 컬럼별 파생값을 메모화 — grouped/columnOverflow 신원이 안정이면 boards-level state
  // 변경(메뉴 토글 등)에 columnData 참조가 바뀌지 않아 BoardColumn memo 가 bail 한다.
  const columnData = useMemo(
    () =>
      columns.map((column) => {
        const columnCards = grouped.get(column.id) ?? [];
        const overflow = columnOverflow?.(column) ?? null;
        const truncated = overflow !== null && columnCards.length > overflow.limit;
        return {
          column,
          count: columnCards.length,
          visibleCards: truncated ? columnCards.slice(0, overflow.limit) : columnCards,
          moreHref: truncated ? overflow.moreHref : null,
        };
      }),
    [columns, grouped, columnOverflow],
  );

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
        accessibility={{
          announcements,
          screenReaderInstructions: boardScreenReaderInstructions,
        }}
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
          {columnData.map(({ column, count, visibleCards, moreHref }) => (
            <BoardColumn
              key={column.id}
              column={column}
              count={count}
              dropState={
                !activeCard
                  ? 'idle'
                  : validDropTargets?.has(column.id)
                    ? 'valid'
                    : 'invalid'
              }
              cards={visibleCards}
              renderCard={renderCard}
              moreHref={moreHref}
              menuOpen={openMenu === column.id}
              onToggleMenu={toggleMenu}
              onCloseMenu={closeMenu}
              onRefresh={refresh}
            />
          ))}
          {CUSTOM_COLUMNS_ENABLED && (
            <AddColumnControl kind={kind} afterPosition={lastColumnPos} onRefresh={refresh} />
          )}
        </div>
        <BoardDragOverlay activeCard={activeCard} renderCard={renderCard} />
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
