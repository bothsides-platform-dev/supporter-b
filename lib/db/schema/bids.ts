import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bidStatusEnum, buyerStageEnum, settleCycleEnum } from './_enums';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { rfpInvitations } from './rfp-invitations';
import { attachments } from './attachments';
import { users } from './users';

export const bids = pgTable(
  'bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: text('rfp_id')
      .notNull()
      .references(() => rfps.id),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id),
    invitationId: uuid('invitation_id')
      .notNull()
      .references(() => rfpInvitations.id),
    settleCycle: settleCycleEnum('settle_cycle').notNull(),
    deposit: numeric('deposit', { precision: 14, scale: 2 }).notNull(),
    setupFee: numeric('setup_fee', { precision: 14, scale: 2 }).notNull(),
    monthlyMin: numeric('monthly_min', { precision: 14, scale: 2 }).notNull(),
    bankTransferFeePct: numeric('bank_transfer_fee_pct', { precision: 5, scale: 3 }).notNull(),
    easyPayFeePct: numeric('easy_pay_fee_pct', { precision: 5, scale: 3 }).notNull(),
    // CHECK: card_fees_by_issuer NOT NULL when buyer grade='general' is enforced at the
    // action layer + tests, not in the DB (cross-table predicate).
    cardFeesByIssuer: jsonb('card_fees_by_issuer'),
    overseasCardFeePct: numeric('overseas_card_fee_pct', { precision: 5, scale: 3 }),
    proposalAttachmentId: uuid('proposal_attachment_id').references(() => attachments.id),
    memo: text('memo').notNull().default(''),
    status: bidStatusEnum('status').notNull().default('submitted'),
    buyerStage: buyerStageEnum('buyer_stage').notNull().default('pending'),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('bids_rfp_pg_unique').on(t.rfpId, t.pgWsId),
  ],
);
