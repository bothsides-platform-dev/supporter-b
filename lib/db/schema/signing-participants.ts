import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { signingContracts } from './signing-contracts';
import { users } from './users';
import {
  signingParticipantRoleEnum,
  signingSecurityMethodEnum,
  signingParticipantStatusEnum,
} from './_enums';

/**
 * 서명 참여자(각 측 1명 — buyer/pg). SnowSign 서명 상태를 폴링으로 미러링(표시·알림용).
 * `security_method` easy_cert 기본, phone 미확보 시 email 로 강등.
 */
export const signingParticipants = pgTable(
  'signing_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => signingContracts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    role: signingParticipantRoleEnum('role').notNull(),
    securityMethod: signingSecurityMethodEnum('security_method').notNull(),
    status: signingParticipantStatusEnum('status').notNull().default('pending'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    providerParticipantRef: text('provider_participant_ref'),
    /**
     * provider 회신 `email_delivery.status` 미러 (delivered/bounced 등, 자유 텍스트).
     * bounced 면 서명 요청 메일이 이 사람에게 닿지 않은 것 — 화면이 지속 경고를 띄운다.
     */
    emailDelivery: text('email_delivery'),
  },
  (t) => [index('signing_participants_contract_idx').on(t.contractId)],
);
