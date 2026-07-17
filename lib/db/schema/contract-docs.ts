import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  check,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfps } from './rfps';
import { bids } from './bids';
import { workspaces } from './workspaces';
import { contractTemplates } from './contract-templates';
import { users } from './users';
import type { ContractPartiesV1, ContractTermsSnapshotV1 } from '@/lib/types/contract-doc';

// 전자계약 문서(1건 = 1회 발송~체결 사이클). 같은 RFP 에 이전 발송이
// 반려/회수/만료되면 새로 발송할 수 있다 — "활성(status='sent') 문서는
// RFP당 최대 1개"만 partial unique index 로 강제한다(하단).
// parties/terms_snapshot 은 발송 시점 스냅샷(버전드 JSONB, lib/types/contract-doc.ts)
// — 이후 RFP/bid 가 바뀌어도 계약서 내용은 고정된다.
export const contractDocs = pgTable(
  'contract_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 사람이 읽는 계약서 번호 — URL/표시용, FK 아님(rfps.code 와 동일 패턴).
    code: text('code').notNull().unique(),
    // 원본 RFP/입찰 참조. 감사 추적 목적으로 삭제 방지(onDelete 미지정=NO ACTION).
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id),
    bidId: uuid('bid_id')
      .notNull()
      .references(() => bids.id),
    buyerWsId: uuid('buyer_ws_id')
      .notNull()
      .references(() => workspaces.id),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id),
    // 발송에 사용한 템플릿 — 템플릿이 나중에 삭제돼도 문서는 남는다.
    templateId: uuid('template_id').references(() => contractTemplates.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('sent'),
    title: text('title').notNull(),
    parties: jsonb('parties').notNull().$type<ContractPartiesV1>(),
    termsSnapshot: jsonb('terms_snapshot').notNull().$type<ContractTermsSnapshotV1>(),
    basePdfKey: text('base_pdf_key').notNull(),
    basePdfSha256: text('base_pdf_sha256').notNull(),
    basePdfSize: integer('base_pdf_size').notNull(),
    finalPdfKey: text('final_pdf_key'),
    finalPdfSha256: text('final_pdf_sha256'),
    finalPdfSize: integer('final_pdf_size'),
    declineReason: text('decline_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    check(
      'contract_docs_status_check',
      sql`${t.status} in ('sent','completed','declined','canceled','expired')`,
    ),
    // 체결 완료면 최종 PDF 가 반드시 있어야 한다.
    check(
      'contract_docs_final_on_complete',
      sql`(${t.status} <> 'completed') OR (${t.finalPdfKey} IS NOT NULL)`,
    ),
    // RFP당 활성(발송중) 문서는 하나 — 반려/회수/만료된 문서는 세지 않는다.
    uniqueIndex('contract_docs_active_rfp_unique')
      .on(t.rfpId)
      .where(sql`${t.status} = 'sent'`),
    index('contract_docs_buyer_ws_idx').on(t.buyerWsId, t.sentAt),
    index('contract_docs_pg_ws_idx').on(t.pgWsId, t.sentAt),
  ],
);
