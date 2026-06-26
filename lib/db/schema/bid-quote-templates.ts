import {
  pgTable,
  uuid,
  text,
  numeric,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { users } from './users';

// Bid quote templates (견적 요율표) — PG-workspace-shared reusable presets so a
// PG never re-types its standard settlement terms + per-method fee rates for
// every RFP. Any member of the PG workspace may save/list/edit/delete that
// workspace's templates; created_by records the authoring user. Cross-workspace
// isolation is the security invariant, enforced in the action layer via the
// active PG session workspace. Mirrors `chat_message_templates`.
//
// Scope deliberately excludes custom payment methods (RFP-specific ids), memo,
// and proposal PDFs — all RFP-dependent and not portable across RFPs.
export const bidQuoteTemplates = pgTable(
  'bid_quote_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // 정산주기: "D+1", "W+2", "M+1" 형식 (bids.settle_cycle 와 동일)
    settleCycle: text('settle_cycle').notNull(),
    // 정산한도 (원/월)
    settleLimit: numeric('settle_limit', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    // 월 보증보험 (원/연)
    guaranteeInsurance: numeric('guarantee_insurance', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    // 표준 결제수단별 수수료 JSONB: 정률 수단은 소수 요율, 정액 수단은 '원' 정수.
    // 예: { card: 0.0125, virtual_account: 300 } (가상계좌=건당 300원)
    paymentFees: jsonb('payment_fees').notNull().default(sql`'{}'::jsonb`),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index('bid_quote_templates_ws_idx').on(t.pgWsId)],
);
