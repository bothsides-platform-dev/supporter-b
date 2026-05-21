'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { KanbanActionDialog } from './KanbanActionDialog';
import { resolveDrag, type DragAction } from './dragMatrix';
import { toast } from '@/lib/toast';
import {
  BUYER_KANBAN_LABEL,
  BUYER_KANBAN_ORDER,
  type BuyerKanbanCard,
  type BuyerKanbanStage,
} from '@/lib/server/buyer-kanban';
import {
  PG_KANBAN_LABEL,
  PG_KANBAN_ORDER,
  type PgKanbanCard,
  type PgKanbanStage,
} from '@/lib/server/pg-kanban';

type DotColor = 'surface' | 'primary' | 'tertiary' | 'warning' | 'error';

const buyerDotColor: Record<BuyerKanbanStage, DotColor> = {
  draft: 'surface',
  sent: 'primary',
  collecting: 'warning',
  comparing: 'primary',
  awarded: 'tertiary',
  closed: 'error',
};

const pgDotColor: Record<PgKanbanStage, DotColor> = {
  received: 'surface',
  reviewing: 'warning',
  drafting: 'primary',
  submitted: 'warning',
  won: 'tertiary',
  lost: 'error',
};

// 드롭 타깃에서 제외할 finality 컬럼. 'closed'/'lost' 는 cancel-rfp / withdraw-bid
// 의 드롭 타깃으로 살려둠. 'awarded'/'won' 만 진짜 닫힘.
const FROZEN_DROP_BUYER: ReadonlySet<BuyerKanbanStage> = new Set(['awarded']);
const FROZEN_DROP_PG: ReadonlySet<PgKanbanStage> = new Set(['won']);

type Props =
  | { role: 'buyer'; cards: BuyerKanbanCard[] }
  | { role: 'pg'; cards: PgKanbanCard[] };

export function KanbanBoard(props: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<DragAction | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith('column:')) return;
    const toStage = overId.slice('column:'.length);

    if (props.role === 'buyer') {
      const card = active.data.current?.card as BuyerKanbanCard | undefined;
      if (!card) return;
      const action = resolveDrag({
        role: 'buyer',
        from: card.stage,
        to: toStage as BuyerKanbanStage,
        rfpId: card.rfpId,
        title: card.title,
      });
      dispatch(action);
    } else {
      const card = active.data.current?.card as PgKanbanCard | undefined;
      if (!card) return;
      const action = resolveDrag({
        role: 'pg',
        from: card.stage,
        to: toStage as PgKanbanStage,
        rfpId: card.rfpId,
        title: card.title,
        bidId: card.bidId,
      });
      dispatch(action);
    }
  };

  const dispatch = (action: DragAction | null) => {
    if (!action) {
      toast('이 단계로는 이동할 수 없습니다.', { type: 'info' });
      return;
    }
    if (action.kind === 'navigate-rfp-detail') {
      toast('낙찰할 PG를 선택하세요.');
      router.push(`/rfp/${action.rfpId}`);
      return;
    }
    if (action.kind === 'navigate-inbox') {
      router.push(`/inbox/${action.rfpId}`);
      return;
    }
    setPendingAction(action);
  };

  if (props.role === 'buyer') {
    return (
      <>
        <DndContext
          id="kanban-buyer"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div
            role="region"
            aria-label="제안 칸반"
            className="flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto lg:overflow-x-visible snap-x snap-mandatory pb-4"
          >
            {BUYER_KANBAN_ORDER.map((stage) => {
              const cards = props.cards.filter((c) => c.stage === stage);
              return (
                <KanbanColumn
                  key={stage}
                  stageId={stage}
                  label={BUYER_KANBAN_LABEL[stage]}
                  count={cards.length}
                  dotColor={buyerDotColor[stage]}
                  frozen={FROZEN_DROP_BUYER.has(stage)}
                  cta={
                    stage === 'draft' ? (
                      <Link
                        href="/rfp-new"
                        className="block text-center py-3 rounded-[var(--md-sys-shape-medium)] border border-dashed border-[var(--md-sys-color-outline-variant)] text-[12px] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
                      >
                        + 새 RFP
                      </Link>
                    ) : undefined
                  }
                >
                  {cards.map((card) => (
                    <KanbanCard
                      key={card.rfpId}
                      role="buyer"
                      card={card}
                      onSelect={() => router.push(`/rfp/${card.rfpId}`)}
                    />
                  ))}
                </KanbanColumn>
              );
            })}
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

  return (
    <>
      <DndContext
        id="kanban-pg"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div
          role="region"
          aria-label="초대받은 RFP 칸반"
          className="flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto lg:overflow-x-visible snap-x snap-mandatory pb-4"
        >
          {PG_KANBAN_ORDER.map((stage) => {
            const cards = props.cards.filter((c) => c.stage === stage);
            return (
              <KanbanColumn
                key={stage}
                stageId={stage}
                label={PG_KANBAN_LABEL[stage]}
                count={cards.length}
                dotColor={pgDotColor[stage]}
                frozen={FROZEN_DROP_PG.has(stage)}
              >
                {cards.map((card) => (
                  <KanbanCard
                    key={card.invitationId}
                    role="pg"
                    card={card}
                    onSelect={() => router.push(`/inbox/${card.rfpId}`)}
                  />
                ))}
              </KanbanColumn>
            );
          })}
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

// Named export so Server Components (app/(app)/home/page.tsx) can render the
// skeleton directly. `KanbanBoard.Skeleton` (static on a 'use client' component)
// resolves to undefined when accessed from a Server Component across the RSC
// boundary — only client callers can use the static. The assignment below
// keeps the `Component.Skeleton` convention working for those client callers.
export function KanbanBoardSkeleton() {
  return (
    <div className="flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto lg:overflow-x-visible snap-x snap-mandatory pb-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col w-72 lg:w-auto lg:min-w-[160px] shrink-0 snap-start bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px]"
        >
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-4" />
          </div>
          <div className="flex flex-col gap-2">
            {i < 2 &&
              Array.from({ length: 2 }).map((_, j) => (
                <Skeleton
                  key={j}
                  className="h-[80px] rounded-[var(--md-sys-shape-medium)]"
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

KanbanBoard.Skeleton = KanbanBoardSkeleton;
