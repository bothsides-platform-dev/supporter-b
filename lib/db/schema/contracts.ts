import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfps } from './rfps';
import { bids } from './bids';
import { users } from './users';

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfpId: text('rfp_id')
    .notNull()
    .unique()
    .references(() => rfps.id),
  bidId: uuid('bid_id')
    .notNull()
    .references(() => bids.id),
  awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().default(sql`now()`),
  awardedBy: uuid('awarded_by')
    .notNull()
    .references(() => users.id),
});
