import {
  pgTable,
  uuid,
  text,
  timestamp,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfpStatusEnum } from './_enums';
import { workspaces } from './workspaces';
import { bizProfiles } from './biz-profiles';
import { users } from './users';
import { bids } from './bids';

export const rfps = pgTable(
  'rfps',
  {
    // P-YYMM-NNNN — application-generated text PK.
    id: text('id').primaryKey(),
    buyerWsId: uuid('buyer_ws_id')
      .notNull()
      .references(() => workspaces.id),
    bizProfileId: uuid('biz_profile_id')
      .references(() => bizProfiles.id),
    title: text('title').notNull(),
    memo: text('memo').notNull().default(''),
    allowedPgWorkspaceIds: uuid('allowed_pg_workspace_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    // RFP-scoped permanent share URL token — buyer copies and distributes
    // to PG workspaces via Slack/KakaoTalk. Authenticated PG workspace members
    // can claim through `/share/rfp/[token]`.
    // Plaintext (not hashed) — RFP owner needs to re-render the URL on revisit;
    // auto-expires at deadline; no rotate policy. The `gen_random_uuid()::text`
    // default exists so backfill on ALTER TABLE and test fixtures stay simple;
    // production callers (createRfpAction) override with `generateToken()`.
    shareToken: text('share_token')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()::text`),
    status: rfpStatusEnum('status').notNull().default('draft'),
    // Circular FK with bids.rfp_id — annotated to break TS recursion.
    awardedBidId: uuid('awarded_bid_id').references((): AnyPgColumn => bids.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'awarded_consistency',
      sql`(${t.awardedBidId} IS NULL) OR (${t.status} = 'awarded')`,
    ),
  ],
);
