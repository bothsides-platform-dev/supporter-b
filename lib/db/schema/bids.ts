import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  numeric,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bidStatusEnum } from './_enums';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { rfpInvitations } from './rfp-invitations';
import { users } from './users';
import { columns } from './columns';

export const bids = pgTable(
  'bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id),
    invitationId: uuid('invitation_id')
      .notNull()
      .references(() => rfpInvitations.id),
    // 정산주기: 자유 텍스트 (예: "D+1", "W+2", "M+1"). 이전 enum 제거.
    settleCycle: text('settle_cycle').notNull(),
    // 정산한도 (원/월)
    settleLimit: numeric('settle_limit', { precision: 14, scale: 2 }).notNull().default('0'),
    // 월 보증보험 (원/연)
    guaranteeInsurance: numeric('guarantee_insurance', { precision: 14, scale: 2 }).notNull().default('0'),
    // 결제수단별 수수료 JSONB: { card: 0.0125, virtual_account: 0.005, ... }
    paymentFees: jsonb('payment_fees').notNull().default(sql`'{}'::jsonb`),
    // 커스텀 결제수단별 수수료 JSONB: { <customId>: 0.02, ... } (rfps.customPaymentMethods.id 기준)
    customFees: jsonb('custom_fees').notNull().default(sql`'{}'::jsonb`),
    // 비수수료 견적 차원의 버전드 JSONB 문서 (정산일 옵션·롤링 리저브·차지백 처리 등).
    // 현재 v1 은 빈 문서 — 미래 차원을 DDL 없이 흡수할 forward 슬롯 (rfps.current_terms 와 동일 패턴).
    quoteTerms: jsonb('quote_terms').notNull().default(sql`'{"_v":1}'::jsonb`),
    memo: text('memo').notNull().default(''),
    /** PG별 제출 순번. 1차=1, 재요청 응답=2…. */
    round: integer('round').notNull().default(1),
    status: bidStatusEnum('status').notNull().default('submitted'),
    boardColumnId: uuid('board_column_id').references(() => columns.id, {
      onDelete: 'set null',
    }),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('bids_rfp_pg_round_unique').on(t.rfpId, t.pgWsId, t.round),
    index('bids_pg_ws_idx').on(t.pgWsId),
    index('bids_board_column_idx').on(t.boardColumnId),
  ],
);
