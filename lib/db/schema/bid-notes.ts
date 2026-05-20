import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bids } from './bids';
import { users } from './users';

// Buyer-side notes attached to a bid — manual memo + (image/PDF) attachments.
// Notes survive reload and propagate across the buyer workspace's members.
// Attachments are linked through `attachments.bid_note_id` (exclusive-arc, C3).
export const bidNotes = pgTable(
  'bid_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bidId: uuid('bid_id')
      .notNull()
      .references(() => bids.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('bid_notes_bid_idx').on(t.bidId, t.createdAt)],
);
