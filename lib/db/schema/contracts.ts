import { pgTable, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfps } from './rfps';
import { bids } from './bids';
import { users } from './users';

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .unique()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    bidId: uuid('bid_id')
      .notNull()
      .references(() => bids.id),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().default(sql`now()`),
    awardedBy: uuid('awarded_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => [index('contracts_bid_idx').on(t.bidId)],
);
