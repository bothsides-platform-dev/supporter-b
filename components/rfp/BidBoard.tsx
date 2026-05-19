'use client';

import {
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
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
import { updateBuyerStageAction } from '@/lib/server/actions/bid/updateBuyerStageAction';
import {
  BUYER_STAGE_ORDER,
  type Bid,
  type BuyerStage,
} from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';
import type { MerchantGrade } from '@/lib/types/biz-profile';

type Props = {
  rfpId: string;
  bids: Bid[];
  notesByBid: Record<string, BidNote[]>;
  grade: MerchantGrade | undefined;
  rfpStatus: string;
  awardedBidId?: string;
  pgWsNameMap: Record<string, string>;
  authorId: string;
  authorName: string;
};

type StageOverride = { bidId: string; to: BuyerStage };

export function BidBoard({
  bids,
  notesByBid,
  grade,
  rfpStatus,
  awardedBidId,
  pgWsNameMap,
  authorId,
  authorName,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Optimistic stage overlay — the action result lands via router.refresh()
  // after the server commit, but the drag visual must reflect the move
  // immediately. The overlay is keyed per bidId; a fresh `bids` prop from
  // the RSC tree resets any stale entry because the reducer reads from props.
  const [optimisticStages, applyStage] = useOptimistic<
    Record<string, BuyerStage>,
    StageOverride
  >({}, (state, patch) => ({ ...state, [patch.bidId]: patch.to }));

  const canAward = rfpStatus === 'sent';
  const disabled = !canAward;

  const stageOf = (bid: Bid): BuyerStage =>
    optimisticStages[bid.id] ?? bid.buyerStage;

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
  }, [bids, optimisticStages]);

  const noteCounts = useMemo<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const bid of bids) {
      acc[bid.id] = notesByBid[bid.id]?.length ?? 0;
    }
    return acc;
  }, [bids, notesByBid]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const commitStage = (bidId: string, to: BuyerStage) => {
    startTransition(async () => {
      applyStage({ bidId, to });
      const r = await updateBuyerStageAction({ bidId, to });
      if (!r.ok) {
        // Optimistic state is React-managed; a refresh re-reads the server
        // truth which the user can retry from. We could surface a toast
        // here in a follow-up.
        router.refresh();
        return;
      }
      router.refresh();
    });
  };

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
    const sourceBid = bids.find((b) => b.id === bidId);
    if (!sourceBid) return;
    if (targetStage !== stageOf(sourceBid)) {
      commitStage(bidId, targetStage);
    }
  };

  const [openBidId, setOpenBidId] = useState<string | null>(null);
  const openBid = openBidId ? bids.find((b) => b.id === openBidId) ?? null : null;
  const openNotes = openBidId ? notesByBid[openBidId] ?? [] : [];

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
              onMoveStage={commitStage}
              noteCounts={noteCounts}
              awardedBidId={awardedBidId}
              canAward={canAward}
              rfpId=""
              disabled={disabled}
            />
          ))}
        </div>
      </DndContext>

      <BidDetailModal
        open={openBidId !== null}
        onOpenChange={(o) => !o && setOpenBidId(null)}
        bid={openBid}
        notes={openNotes}
        pgName={openBid ? pgName(openBid.pgWsId) : ''}
        stage={openBid ? stageOf(openBid) : 'pending'}
        grade={grade}
        authorId={authorId}
        authorName={authorName}
      />
    </>
  );
}
