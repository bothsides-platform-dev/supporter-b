import { pgTable, uuid, text, integer, jsonb, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';
import { rfps } from './rfps';
import { bids } from './bids';
import type { BidDraft } from '@/lib/quote/bid-draft';

export const bidDrafts = pgTable(
  'bid_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    roundKey: text('round_key').notNull(),
    revision: integer('revision').notNull().default(1),
    content: jsonb('content').$type<BidDraft>().notNull(),
    submittedBidId: uuid('submitted_bid_id').references(() => bids.id, {
      onDelete: 'cascade',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('bid_drafts_scope_unique').on(t.userId, t.workspaceId, t.rfpId, t.roundKey),
    index('bid_drafts_owner_idx').on(t.userId, t.workspaceId),
  ],
);
