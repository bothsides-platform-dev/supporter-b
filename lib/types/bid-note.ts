import type { Attachment } from './common';

// Buyer-side note attached to a Bid. Manual memos + image/PDF attachments only —
// no automatic stage-transition logs and no Bid-diff entries (PG_RFP_SPEC §7).
// Canonical store: lib/stores/bid-board.ts (localStorage). Server-side cutover
// to bid_notes table + addBidNoteAction is post-v0.
export type BidNote = {
  id: string;
  bidId: string;
  authorId: string;
  authorName: string;
  body: string;
  attachments: Attachment[];
  createdAt: string;
};
