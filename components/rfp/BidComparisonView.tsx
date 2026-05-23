'use client';

import { useState } from 'react';
import { BidComparisonTable } from './BidComparisonTable';
import { RfpBidsBoard } from '@/components/board/RfpBidsBoard';
import { BidViewToggle, type BidView } from './BidViewToggle';
import type { Bid } from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';
import type { MerchantGrade } from '@/lib/types/biz-profile';
import type { BoardCard, BoardColumn } from '@/lib/types/column';

type Props = {
  rfpId: string;
  bids: Bid[];
  boardColumns: BoardColumn[];
  boardCards: BoardCard[];
  notesByBid: Record<string, BidNote[]>;
  grade: MerchantGrade | undefined;
  rfpStatus: string;
  awardedBidId?: string;
  pgWsNameMap: Record<string, string>;
  authorId: string;
  authorName: string;
};

export function BidComparisonView(props: Props) {
  const [view, setView] = useState<BidView>('table');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <BidViewToggle value={view} onChange={setView} tableCount={props.bids.length} />
      </div>
      {view === 'table' ? (
        <BidComparisonTable
          rfpId={props.rfpId}
          bids={props.bids}
          grade={props.grade}
          rfpStatus={props.rfpStatus}
          awardedBidId={props.awardedBidId}
          pgWsNameMap={props.pgWsNameMap}
        />
      ) : (
        <RfpBidsBoard
          columns={props.boardColumns}
          cards={props.boardCards}
          notesByBid={props.notesByBid}
          grade={props.grade}
          awardedBidId={props.awardedBidId}
          pgWsNameMap={props.pgWsNameMap}
          authorId={props.authorId}
          authorName={props.authorName}
        />
      )}
    </div>
  );
}
