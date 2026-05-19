import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bids } from './bids';
import { users } from './users';

// Buyer-side notes attached to a bid — manual memo + (image/PDF) attachments.
// Pre-v0 these lived in localStorage (lib/stores/bid-board.ts). Stage 3 cuts
// over to the server so notes survive reload and propagate across the buyer
// workspace's members. Attachments are linked through the polymorphic
// `attachments` row with `owner_kind='bid_note'`.
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
  },
  (t) => [index('bid_notes_bid_idx').on(t.bidId, t.createdAt)],
);
