'use client';

import { useState } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { BidCard } from './BidCard';
import { BidDetailModal } from '@/components/rfp/BidDetailModal';
import type { BoardCard, BoardColumn } from '@/lib/types/column';
import type { Bid } from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';

// Client wrapper for the RFP bid board (rfp_bids kind). Owns the detail-modal
// open state and supplies the bid-card renderCard.
export function RfpBidsBoard({
  columns,
  cards,
  notesByBid,
  awardedBidId,
  pgWsNameMap,
  authorId,
  authorName,
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
  notesByBid: Record<string, BidNote[]>;
  awardedBidId?: string;
  pgWsNameMap: Record<string, string>;
  authorId: string;
  authorName: string;
}) {
  const [openBidId, setOpenBidId] = useState<string | null>(null);
  const bidById = new Map(cards.map((c) => [c.cardId, c.payload as Bid]));
  const openBid = openBidId ? bidById.get(openBidId) ?? null : null;
  const openNotes = openBidId ? notesByBid[openBidId] ?? [] : [];
  const pgName = (wsId: string): string => pgWsNameMap[wsId] ?? wsId;

  return (
    <>
      <KanbanBoard
        kind="rfp_bids"
        cardType="bid"
        columns={columns}
        cards={cards}
        renderCard={(card) => {
          const bid = card.payload as Bid;
          return (
            <BidCard
              bid={bid}
              pgName={pgName(bid.pgWsId)}
              isAwarded={awardedBidId === bid.id}
              noteCount={notesByBid[bid.id]?.length ?? 0}
              onClick={() => setOpenBidId(bid.id)}
            />
          );
        }}
      />
      <BidDetailModal
        open={openBidId !== null}
        onOpenChange={(o) => !o && setOpenBidId(null)}
        bid={openBid}
        notes={openNotes}
        pgName={openBid ? pgName(openBid.pgWsId) : ''}
        authorId={authorId}
        authorName={authorName}
      />
    </>
  );
}
