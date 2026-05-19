import type { Attachment } from './common';

// Buyer-side note attached to a Bid. Manual memos + image/PDF attachments only —
// no automatic stage-transition logs and no Bid-diff entries (PG_RFP_SPEC §7).
// DB-backed from Stage 3 onward — bid_notes table + addBidNoteAction. This
// shape is the client-serialized projection (Date → ISO string).
export type BidNote = {
  id: string;
  bidId: string;
  authorId: string;
  authorName: string;
  body: string;
  attachments: Attachment[];
  createdAt: string;
};
