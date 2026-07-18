import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { signingContractStatusEnum } from './_enums';
import { rfps } from './rfps';
import { users } from './users';

/**
 * 선정 후 전자서명 계약 1건(SnowSign Templates 기반). 레거시 `contracts`(선정 기록)와
 * 별개·불변. `provider_ref` = SnowSign contract_id(생성 후 세팅), `snowsign_template_id` =
 * 사용한 PG 템플릿. 상태 폴링으로 SnowSign과 동기화(webhook 없음).
 */
export const signingContracts = pgTable(
  'signing_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    providerRef: text('provider_ref'),
    snowsignTemplateId: text('snowsign_template_id'),
    status: signingContractStatusEnum('status').notNull().default('awaiting_pg_template'),
    round: integer('round').notNull().default(1),
    deadlineDays: integer('deadline_days'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
  },
  (t) => [
    // 활성 계약은 RFP당 1건. 완료/취소/만료/거절 후에는 새 라운드(재발송) 허용.
    uniqueIndex('signing_contracts_active_rfp_uniq')
      .on(t.rfpId)
      .where(sql`status in ('awaiting_pg_template','sent','in_progress')`),
    // cron 폴링: 진행 중 계약을 오래 안 본 순으로 스캔.
    index('signing_contracts_status_polled_idx').on(t.status, t.lastPolledAt),
  ],
);
