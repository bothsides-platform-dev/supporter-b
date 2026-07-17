import {
  pgTable,
  uuid,
  text,
  timestamp,
  customType,
  check,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contractDocs } from './contract-docs';
import { users } from './users';

const bytea = customType<{
  data: Buffer;
  driverData: Buffer | Uint8Array;
  default: false;
}>({
  dataType() {
    return 'bytea';
  },
  fromDriver(value) {
    return Buffer.from(value as Uint8Array);
  },
});

// 문서당 서명자 정확히 2행(buyer 1 + pg 1) — UNIQUE(doc_id, party) 로 강제.
// 서명 이미지(bytea)는 여기 저장하지만 도메인 타입(lib/types/contract-doc.ts
// ContractDocSigner)에는 싣지 않는다 — 리포의 getSignerImage 전용 조회로만 접근.
export const contractDocSigners = pgTable(
  'contract_doc_signers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: uuid('doc_id')
      .notNull()
      .references(() => contractDocs.id, { onDelete: 'cascade' }),
    party: text('party').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    consentTextVersion: text('consent_text_version'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signatureImage: bytea('signature_image'),
    signatureMethod: text('signature_method'),
    signIp: text('sign_ip'),
    signUserAgent: text('sign_user_agent'),
    reassignedBy: uuid('reassigned_by').references(() => users.id),
    reassignedAt: timestamp('reassigned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    check('contract_doc_signers_party_check', sql`${t.party} in ('buyer','pg')`),
    check(
      'contract_doc_signers_signature_method_check',
      sql`${t.signatureMethod} IS NULL OR ${t.signatureMethod} IN ('draw','type')`,
    ),
    // 서명 시각과 서명 이미지는 항상 함께 있거나 함께 없어야 한다.
    check(
      'contract_doc_signers_signed_consistency',
      sql`(${t.signedAt} IS NULL) = (${t.signatureImage} IS NULL)`,
    ),
    uniqueIndex('contract_doc_signers_doc_party_unique').on(t.docId, t.party),
    index('contract_doc_signers_user_idx').on(t.userId),
  ],
);
