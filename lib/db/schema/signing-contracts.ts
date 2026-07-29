import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { signingContractStatusEnum } from './_enums';
import { rfps } from './rfps';
import { users } from './users';

/**
 * 선정 후 전자서명 계약 1건(SnowSign Templates 기반). 레거시 `contracts`(선정 기록)와
 * 별개·불변. `provider_ref` = SnowSign contract_id(생성 후 세팅), `snowsign_template_id` =
 * 사용한 PG 템플릿. SnowSign 웹훅(저지연 트리거) + 폴링(백스톱)으로 상태 동기화.
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
    /**
     * 발송 클레임 리스. PG 담당자 둘이 동시에 '보내기'를 눌러도 SnowSign 계약이
     * 하나만 생기도록 awaiting 행을 CAS 로 선점한 시각. 발송이 중간에 죽어도
     * 리스가 만료되면 다시 누를 수 있다. 내부 전용 — `SigningContract` 도메인
     * 타입에는 싣지 않는다(UI 는 이 값을 볼 이유가 없다).
     */
    claimedForSendAt: timestamp('claimed_for_send_at', { withTimezone: true }),
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
    // 웹훅 트리거 조회 키: findByProviderRef(provider_ref) — 시퀀셜 스캔 방지.
    index('signing_contracts_provider_ref_idx').on(t.providerRef),
  ],
);
