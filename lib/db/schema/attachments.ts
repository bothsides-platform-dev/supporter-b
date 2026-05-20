import { pgTable, uuid, text, timestamp, integer, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { rfps } from './rfps';
import { bids } from './bids';
import { bidNotes } from './bid-notes';

// Exclusive-arc ownership (C3) — replaces the polymorphic (owner_kind, owner_id)
// pair. Exactly one of rfp_id / bid_id / bid_note_id is set once linked; all
// three NULL is allowed for draft uploads (file uploaded before its owner row
// exists). CHECK enforces "at most one" so an attachment can never point at
// multiple owners. Bytes live 1:1 in attachment_blobs keyed by this id (C4).
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
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    check(
      'attachments_single_owner',
      sql`num_nonnulls(${t.rfpId}, ${t.bidId}, ${t.bidNoteId}) <= 1`,
    ),
    index('attachments_rfp_idx').on(t.rfpId).where(sql`${t.rfpId} IS NOT NULL`),
    index('attachments_bid_idx').on(t.bidId).where(sql`${t.bidId} IS NOT NULL`),
    index('attachments_bid_note_idx')
      .on(t.bidNoteId)
      .where(sql`${t.bidNoteId} IS NOT NULL`),
  ],
);
