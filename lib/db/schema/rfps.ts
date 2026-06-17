import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  check,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfpStatusEnum, contractTypeEnum } from './_enums';
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
    websiteUrl: text('website_url'),
    mainProducts: text('main_products'),
    // 현재조건 브리프(수수료율·정산한도·보증보험·정산주기·배송주기·솔루션·연거래량)는
    // current_terms 문서가 단일 저장소 — 개별 컬럼 없음 (lib/types/rfp-terms.ts CurrentTermsV1).
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
    // 구매사가 요청한 결제수단 목록 (PG사는 이 수단만 견적). 빈 배열 = 제한 없음.
    requiredPaymentMethods: text('required_payment_methods').array().notNull().default([]),
    // 구매사 직접입력 커스텀 결제수단: [{ id, label }] (id는 서버가 발급). PG는 이 id로 customFees 제출.
    customPaymentMethods: jsonb('custom_payment_methods').notNull().default(sql`'[]'::jsonb`),
    // 오픈 RFP 게시판 노출 여부 (opt-out). 기본 true = 노출. 구매사가 끄면 PG
    // 게시판/홈 탐색에서 사라진다. default true ⇒ 기존 행 백필 시 모두 노출.
    boardVisible: boolean('board_visible').notNull().default(true),
    // 현재조건 브리프의 버전드 JSONB 문서 (lib/types/rfp-terms.ts CurrentTermsV1) — 단일 저장소.
    // bids.paymentFees 패턴 일반화 — 새 브리프 필드는 DDL 없이 타입+zod 만 수정.
    currentTerms: jsonb('current_terms').notNull().default(sql`'{"_v":1}'::jsonb`),
    // PG 에게 숨길 필드 경로 목록 (예: 'currentTerms.feeRate'). currentFeeVisibleToPg 의 일반화.
    // loadPgRfpDetail 이 PG_STRIP allowlist(HIDEABLE_PG_PATHS) 와 교집합만 server-side strip.
    hiddenFromPg: text('hidden_from_pg').array().notNull().default([]),
    // 온보딩 샘플 RFP 표식. true면 '샘플' 칩·읽기전용 샌드박스·전용 하드삭제 게이트가 켜진다.
    isSample: boolean('is_sample').notNull().default(false),
    // 계약 유형: 신규 계약('new') 또는 갱신 계약('renewal'). 선택사항 — null이면 미표시.
    contractType: contractTypeEnum('contract_type'),
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
