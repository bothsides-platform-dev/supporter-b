import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { columns } from './columns';
import { bids } from './bids';

// Explicit placement of a bid card (buyer rfp_bids board) into a custom column
// (협상중/결정). Sparse: unplaced bids fall back to the "진행전" default-landing
// column. One placement per card (bid_id unique). Replaces bids.buyer_stage.
export const bidPlacements = pgTable(
  'bid_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    columnId: uuid('column_id')
      .notNull()
      .references(() => columns.id, { onDelete: 'cascade' }),
    bidId: uuid('bid_id')
      .notNull()
      .unique()
      .references(() => bids.id, { onDelete: 'cascade' }),
    position: text('position').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('bid_placements_column_idx').on(t.columnId)],
);
