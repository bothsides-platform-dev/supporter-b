'use client';

// Drop-dispatch logic for the unified kanban board, extracted from KanbanBoard
// so every drop path (navigate / dialog / place / release / reject) is
// unit-testable without simulating dnd-kit pointer events.
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { DragAction } from '@/components/home/dragMatrix';
import { boardKeyboardCoordinateGetter } from './boardKeyboardCoordinateGetter';
import { resolveBoardDrop } from './resolveBoardDrop';
import { computeValidDropTargets } from './computeValidDropTargets';
import { moveCardAction } from '@/lib/server/actions/board/moveCardAction';
import { releaseCardAction } from '@/lib/server/actions/board/releaseCardAction';
import { toast } from '@/lib/toast';
import type { BoardCard, BoardColumn, CardType } from '@/lib/types/column';

// React 19의 useOptimistic 은 액션이 없을 때 첫 번째 인수를 그대로 반환한다.
// 인라인 {} 리터럴을 넘기면 매 렌더 새 참조 → overrides 가 불안정 → grouped/columnData
// useMemo 가 매번 재계산 → BoardColumn memo 가 bail 하지 못한다.
// 모듈-수준 상수를 사용해 참조를 고정한다.
const EMPTY_OVERRIDES: Record<string, string> = {};

// navigate-* actions must route immediately — KanbanActionDialog renders null
// for them by design, so funneling them into pendingAction is a silent no-op.
function navigationHref(action: DragAction): string | null {
  if (action.kind === 'navigate-rfp-detail') return `/rfp/${action.rfpId}`;
  if (action.kind === 'navigate-inbox') return `/inbox/${action.rfpId}`;
  return null;
}

export function useBoardDnd({
  cardType,
  columns,
  cards,
}: {
  cardType: CardType;
  columns: BoardColumn[];
  cards: BoardCard[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<DragAction | null>(null);

  // Optimistic column override per card (the server truth lands via refresh()).
  const [overrides, applyOverride] = useOptimistic<
    Record<string, string>,
    { cardId: string; columnId: string }
  >(EMPTY_OVERRIDES, (state, patch) => ({ ...state, [patch.cardId]: patch.columnId }));

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

  // 마우스는 4px 이동 후 드래그(클릭과 구분), 터치는 길게 눌러 드래그 — 카드 위에서도
  // 세로 스크롤이 살아 있도록 touchAction 차단 대신 delay 활성화를 쓴다.
  // KeyboardSensor 는 전용 드래그 핸들(setActivatorNodeRef)에서만 활성화되므로
  // 카드 버튼의 Enter/Space 를 죽이지 않는다.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinateGetter }),
  );

  // 드래그 중인 카드 — DragOverlay 렌더 + 유효/무효 드롭 컬럼 시각화의 단일 소스.
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);

  const validDropTargets = useMemo(
    () =>
      activeCard
        ? computeValidDropTargets({
            card: activeCard,
            columns,
            cardType,
            currentColumnId: columnOf(activeCard),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCard, columns, cardType, overrides],
  );

  const handleDragStart = (e: DragStartEvent) => {
    const card =
      (e.active.data.current as { card?: BoardCard } | undefined)?.card ?? null;
    setActiveCard(card);
  };

  const handleDragCancel = () => setActiveCard(null);

  const commitPlace = (card: BoardCard, toColumn: BoardColumn) => {
    startTransition(async () => {
      applyOverride({ cardId: card.cardId, columnId: toColumn.id });
      const r = await moveCardAction({
        cardType,
        cardId: card.cardId,
        toColumnId: toColumn.id,
      });
      if (!r.ok) toast(`이동하지 못했어요 — ${r.error}`, { type: 'error' });
      router.refresh();
    });
  };

  const commitRelease = (card: BoardCard) => {
    const wantKey = (card.payload as { stage?: string }).stage;
    const target = columns.find((c) => c.lifecycleKey === wantKey);
    startTransition(async () => {
      if (target) applyOverride({ cardId: card.cardId, columnId: target.id });
      const r = await releaseCardAction({ cardType, cardId: card.cardId });
      if (!r.ok) toast(`이동하지 못했어요 — ${r.error}`, { type: 'error' });
      router.refresh();
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = e;
    if (!over) return;
    // over 는 항상 droppable(컬럼) — 카드는 draggable 로만 등록되므로 card:* 가 올 수 없다.
    const overId = String(over.id);
    if (!overId.startsWith('column:')) return;
    const toColumnId = overId.slice('column:'.length);

    const cardId = String(active.id).slice('card:'.length);
    const card = cards.find((c) => c.cardId === cardId);
    const toColumn = columns.find((c) => c.id === toColumnId);
    if (!card || !toColumn) return;
    if (columnOf(card) === toColumn.id) return; // no-op

    const drop = resolveBoardDrop({ cardType, toColumn, payload: card.payload as object });
    switch (drop.kind) {
      case 'reject':
        toast('이 컬럼으로는 이동할 수 없습니다.', { type: 'info' });
        return;
      case 'lifecycle': {
        const href = navigationHref(drop.action);
        if (href) router.push(href);
        else setPendingAction(drop.action);
        return;
      }
      case 'place':
        commitPlace(card, toColumn);
        return;
      case 'release':
        commitRelease(card);
        return;
    }
  };

  return {
    sensors,
    grouped,
    pendingAction,
    clearPendingAction: () => setPendingAction(null),
    activeCard,
    validDropTargets,
    handleDragStart,
    handleDragCancel,
    handleDragEnd,
  };
}
