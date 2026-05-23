import {
  pgTable,
  uuid,
  text,
  timestamp,
  check,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfpStatusEnum } from './_enums';
import { workspaces } from './workspaces';
import { bizProfiles } from './biz-profiles';
import { users } from './users';
import { bids } from './bids';
import { columns } from './columns';

export const rfps = pgTable(
  'rfps',
  {
    // Surrogate uuid PK — FKs (bids, rfp_invitations, contracts, attachments,
    // rfp_allowed_pg) reference this, not the human code. App generates v7 in
    // createRfpAction; default keeps fixtures simple.
    id: uuid('id').primaryKey().defaultRandom(),
    // Human-facing RFP number P-YYMM-NNNN — used in URLs/display, not as FK.
    code: text('code').notNull().unique(),
    buyerWsId: uuid('buyer_ws_id')
      .notNull()
      .references(() => workspaces.id),
    bizProfileId: uuid('biz_profile_id').references(() => bizProfiles.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    memo: text('memo').notNull().default(''),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    // RFP-scoped permanent share URL token — buyer distributes to PG workspaces.
    // Plaintext; auto-expires at deadline; default exists for fixtures/backfill,
    // production overrides with generateToken().
    shareToken: text('share_token')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()::text`),
    status: rfpStatusEnum('status').notNull().default('draft'),
    // Circular FK with bids.rfp_id — annotated to break TS recursion.
    awardedBidId: uuid('awarded_bid_id').references((): AnyPgColumn => bids.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    // Unified kanban (pipeline board): explicit placement into a custom column.
    // null ⇒ classifier-derived. ON DELETE SET NULL ⇒ deleting a custom column
    // auto-returns its cards to auto-classification.
    boardColumnId: uuid('board_column_id').references(() => columns.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'awarded_consistency',
      sql`(${t.awardedBidId} IS NULL) OR (${t.status} = 'awarded')`,
    ),
    index('rfps_buyer_ws_idx').on(t.buyerWsId),
    index('rfps_awarded_bid_idx').on(t.awardedBidId),
    index('rfps_board_column_idx').on(t.boardColumnId),
  ],
);
