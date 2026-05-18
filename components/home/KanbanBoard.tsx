'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { KanbanCardDetailModal } from './KanbanCardDetailModal';
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

// 드롭 타깃에서 제외할 finality 컬럼. 'closed'/'lost' 는 cancel-rfq / withdraw-bid
// 의 드롭 타깃으로 살려둠. 'awarded'/'won' 만 진짜 닫힘.
const FROZEN_DROP_BUYER: ReadonlySet<BuyerKanbanStage> = new Set(['awarded']);
const FROZEN_DROP_PG: ReadonlySet<PgKanbanStage> = new Set(['won']);

type Props =
  | { role: 'buyer'; cards: BuyerKanbanCard[] }
  | { role: 'pg'; cards: PgKanbanCard[] };

export function KanbanBoard(props: Props) {
  const router = useRouter();
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerKanbanCard | null>(
    null,
  );
  const [selectedPg, setSelectedPg] = useState<PgKanbanCard | null>(null);
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
        rfqId: card.rfqId,
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
        rfqId: card.rfqId,
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
    if (action.kind === 'navigate-rfq-detail') {
      toast('낙찰할 PG를 선택하세요.');
      router.push(`/rfq/${action.rfqId}`);
      return;
    }
    if (action.kind === 'navigate-inbox') {
      router.push(`/inbox/${action.rfqId}`);
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
            aria-label="견적 칸반"
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
                        href="/rfq/new"
                        className="block text-center py-3 rounded-[var(--md-sys-shape-medium)] border border-dashed border-[var(--md-sys-color-outline-variant)] text-[12px] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
                      >
                        + 새 RFQ
                      </Link>
                    ) : undefined
                  }
                >
                  {cards.map((card) => (
                    <KanbanCard
                      key={card.rfqId}
                      role="buyer"
                      card={card}
                      onSelect={() => setSelectedBuyer(card)}
                    />
                  ))}
                </KanbanColumn>
              );
            })}
          </div>
        </DndContext>
        <KanbanCardDetailModal
          role="buyer"
          card={selectedBuyer}
          onOpenChange={(open) => !open && setSelectedBuyer(null)}
        />
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
          aria-label="초대받은 RFQ 칸반"
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
                    onSelect={() => setSelectedPg(card)}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      </DndContext>
      <KanbanCardDetailModal
        role="pg"
        card={selectedPg}
        onOpenChange={(open) => !open && setSelectedPg(null)}
      />
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
