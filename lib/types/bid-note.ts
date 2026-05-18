import type { Attachment } from './common';

// Buyer-side note attached to a Bid. Manual memos + image/PDF attachments only —
// no automatic stage-transition logs and no Bid-diff entries (PG_RFP_SPEC §7).
// In mock/v0 the canonical store is lib/stores/bid-board.ts; M8 cutover replaces
// it with the bid_notes table + addBidNoteAction (BACKEND_MIGRATION.md).
export type BidNote = {
  id: string;
  bidId: string;
  authorId: string;
  authorName: string;
  body: string;
  attachments: Attachment[];
  createdAt: string;
};
