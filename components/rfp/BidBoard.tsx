'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import { BidBoardColumn } from './BidBoardColumn';
import { BidDetailModal } from './BidDetailModal';
import { useBidBoardStore, seedDemoBidBoard } from '@/lib/stores/bid-board';
import {
  BUYER_STAGE_ORDER,
  type Bid,
  type BuyerStage,
} from '@/lib/types/bid';
import type { MerchantGrade } from '@/lib/types/biz-profile';

type Props = {
  rfpId: string;
  bids: Bid[];
  grade: MerchantGrade | undefined;
  rfpStatus: string;
  awardedBidId?: string;
  pgWsNameMap: Record<string, string>;
  authorId: string;
  authorName: string;
};

export function BidBoard({
  rfpId,
  bids,
  grade,
  rfpStatus,
  awardedBidId,
  pgWsNameMap,
  authorId,
  authorName,
}: Props) {
  const stages = useBidBoardStore((s) => s.stages);
  const notes = useBidBoardStore((s) => s.notes);
  const moveStage = useBidBoardStore((s) => s.moveStage);

  // SSR-safe hydration: store has skipHydration=true. We trigger rehydrate on
  // mount and observe completion via persist.onFinishHydration so we never
  // call setState synchronously inside an effect.
  const hydrated = useSyncExternalStore(
    (cb) => useBidBoardStore.persist.onFinishHydration(cb),
    () => useBidBoardStore.persist.hasHydrated(),
    () => false,
  );
  useEffect(() => {
    if (!useBidBoardStore.persist.hasHydrated()) {
      void useBidBoardStore.persist.rehydrate();
    }
  }, []);

  // Demo seed (dev-only; idempotent inside the helper). One-shot on first
  // post-hydration render — the seed reads bids/pgWsNameMap as a snapshot,
  // we don't want to re-fire when those references change between RSC passes.
  useEffect(() => {
    if (!hydrated) return;
    seedDemoBidBoard({
      bids: bids.map((b) => ({ id: b.id, pgWsId: b.pgWsId })),
      pgWsNameMap,
      authorId,
      authorName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Force awarded bid into "decided" once we know about it (one-shot).
  useEffect(() => {
    if (!hydrated || !awardedBidId) return;
    const current = stages[awardedBidId];
    if (current !== 'decided') {
      moveStage(awardedBidId, 'decided');
    }
    // we intentionally only react to awardedBidId changes here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, awardedBidId]);

  const canAward = rfpStatus === 'sent';
  const disabled = !canAward;

  const stageOf = (bid: Bid): BuyerStage =>
    stages[bid.id] ?? bid.buyerStage ?? 'pending';

  // Group bids per stage in their input order. awardedBidId is already
  // forced to 'decided' by the effect above.
  const grouped = useMemo<Record<BuyerStage, Bid[]>>(() => {
    const acc: Record<BuyerStage, Bid[]> = {
      pending: [],
      negotiating: [],
      decided: [],
    };
    for (const bid of bids) {
      acc[stageOf(bid)].push(bid);
    }
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bids, stages]);

  const noteCounts = useMemo<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const bid of bids) {
      acc[bid.id] = notes[bid.id]?.length ?? 0;
    }
    return acc;
  }, [bids, notes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const bidId = String(active.id);
    const overId = String(over.id);
    const targetStage: BuyerStage = (BUYER_STAGE_ORDER as readonly string[]).includes(overId)
      ? (overId as BuyerStage)
      : (() => {
          const overBid = bids.find((b) => b.id === overId);
          return overBid ? stageOf(overBid) : stageOf(bids.find((b) => b.id === bidId)!);
        })();
    const sourceStage = stageOf(bids.find((b) => b.id === bidId)!);
    if (targetStage !== sourceStage) {
      moveStage(bidId, targetStage);
    }
  };

  const [openBidId, setOpenBidId] = useState<string | null>(null);
  const openBid = openBidId ? bids.find((b) => b.id === openBidId) ?? null : null;

  const pgName = (wsId: string): string => pgWsNameMap[wsId] ?? wsId;

  return (
    <>
      <DndContext
        id="bid-board"
        sensors={disabled ? [] : sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-3 gap-6">
          {BUYER_STAGE_ORDER.map((stage) => (
            <BidBoardColumn
              key={stage}
              stage={stage}
              bids={grouped[stage]}
              pgName={pgName}
              onCardClick={setOpenBidId}
              onMoveStage={moveStage}
              noteCounts={noteCounts}
              awardedBidId={awardedBidId}
              canAward={canAward}
              rfpId={rfpId}
              disabled={disabled}
            />
          ))}
        </div>
      </DndContext>

      <BidDetailModal
        open={openBidId !== null}
        onOpenChange={(o) => !o && setOpenBidId(null)}
        bid={openBid}
        pgName={openBid ? pgName(openBid.pgWsId) : ''}
        stage={openBid ? stageOf(openBid) : 'pending'}
        grade={grade}
        authorId={authorId}
        authorName={authorName}
      />
    </>
  );
}
