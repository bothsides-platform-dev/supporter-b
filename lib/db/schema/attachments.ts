import { pgTable, uuid, text, timestamp, integer, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { rfps } from './rfps';
import { bids } from './bids';
import { bidNotes } from './bid-notes';
import { chatMessages } from './chat-messages';
import { rfpTeamMessages } from './rfp-team-messages';

// Exclusive-arc ownership (C3) — replaces the polymorphic (owner_kind, owner_id)
// pair. Exactly one of rfp_id / bid_id / bid_note_id / chat_message_id /
// rfp_team_message_id is set once linked; all NULL is allowed for draft uploads
// (file uploaded before its owner row exists). CHECK enforces "at most one" so an
// attachment can never point at multiple owners. Bytes live in Cloudflare R2
// under `attachments/<id>` keyed by this id (C4) — see lib/server/storage/r2.ts.
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    mimeType: text('mime_type').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    rfpId: uuid('rfp_id').references(() => rfps.id, { onDelete: 'cascade' }),
    bidId: uuid('bid_id').references(() => bids.id, { onDelete: 'cascade' }),
    bidNoteId: uuid('bid_note_id').references(() => bidNotes.id, { onDelete: 'cascade' }),
    chatMessageId: uuid('chat_message_id').references(() => chatMessages.id, {
      onDelete: 'cascade',
    }),
    rfpTeamMessageId: uuid('rfp_team_message_id').references(() => rfpTeamMessages.id, {
      onDelete: 'cascade',
    }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().default(sql`now()`),
    // Two-phase presigned upload (Stage 2): row is created at presign time as
    // 'pending' (bytes not yet verified in R2), then flipped to 'ready' by the
    // complete route once the object is confirmed. Every read path other than
    // findById/claim-verification must filter to 'ready' — an unverified
    // pending row must never surface in RFP/bid/note/team-message UI, and must
    // never be claimable as an owner (fail-closed). A sweeper deletes stale
    // pending rows past a cutoff (see deleteStalePending).
    status: text('status').notNull().default('ready'),
  },
  (t) => [
    check(
      'attachments_single_owner',
      sql`num_nonnulls(${t.rfpId}, ${t.bidId}, ${t.bidNoteId}, ${t.chatMessageId}, ${t.rfpTeamMessageId}) <= 1`,
    ),
    check('attachments_status_check', sql`${t.status} in ('pending','ready')`),
    index('attachments_rfp_idx').on(t.rfpId).where(sql`${t.rfpId} IS NOT NULL`),
    index('attachments_bid_idx').on(t.bidId).where(sql`${t.bidId} IS NOT NULL`),
    index('attachments_bid_note_idx')
      .on(t.bidNoteId)
      .where(sql`${t.bidNoteId} IS NOT NULL`),
    index('attachments_chat_message_idx')
      .on(t.chatMessageId)
      .where(sql`${t.chatMessageId} IS NOT NULL`),
    index('attachments_rfp_team_message_idx')
      .on(t.rfpTeamMessageId)
      .where(sql`${t.rfpTeamMessageId} IS NOT NULL`),
    // Sweeper lookup: find pending rows older than a cutoff to reclaim/delete.
    index('attachments_pending_idx').on(t.uploadedAt).where(sql`${t.status} = 'pending'`),
  ],
);
