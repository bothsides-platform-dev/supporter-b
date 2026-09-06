import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { signingContracts } from './signing-contracts';
import { users } from './users';

/**
 * 계약 보관함 — 완료된 전자서명 계약의 사본(자동)과 수동 업로드 계약서를
 * 워크스페이스별로 보관한다. 스냅샷 메타(rfp_code/title/counterparty_name/
 * contracted_at)를 행에 복사해 signing_contracts 가 RFP CASCADE 로 죽어도
 * (signing_contract_id SET NULL) 항목이 홀로 선다.
 *
 * 봉인 경계: provider_ref 를 여기 두지 않는다 — 하이드레이션이 필요할 때만
 * signing_contracts 에서 좁게 읽는다.
 */
export const contractArchives = pgTable(
  'contract_archives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    signingContractId: uuid('signing_contract_id').references(() => signingContracts.id, {
      onDelete: 'set null',
    }),
    rfpCode: text('rfp_code'),
    title: text('title').notNull(),
    counterpartyName: text('counterparty_name'),
    contractedAt: timestamp('contracted_at', { withTimezone: true }),
    // pending = 바이트 미확보(자동: 하이드레이션 대기 / 수동: PUT-complete 대기)
    status: text('status').notNull().default('pending'),
    documentKey: text('document_key'),
    documentName: text('document_name'),
    documentSize: integer('document_size'),
    auditKey: text('audit_key'),
    auditName: text('audit_name'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    check('contract_archives_source_check', sql`${t.source} in ('signing','upload')`),
    check('contract_archives_status_check', sql`${t.status} in ('pending','ready','failed')`),
    // 자동 보관 멱등의 근거 — 행 생성 경로(완료 훅 + 백필)가 겹쳐도 무해.
    uniqueIndex('contract_archives_ws_signing_uniq')
      .on(t.workspaceId, t.signingContractId)
      .where(sql`${t.signingContractId} is not null`),
    index('contract_archives_ws_created_idx').on(t.workspaceId, t.createdAt),
    // 하이드레이션·스윕 스캔용.
    index('contract_archives_pending_idx').on(t.createdAt).where(sql`${t.status} = 'pending'`),
    // `signing_contract_id` 단독 조회용. 위 복합 유니크는 `workspace_id` 가 선두라
    // 이 컬럼만으로 하는 동등 조회를 받지 못한다. 소비자 셋:
    //   · markSigningReady / recordSigningAttempt / markSigningFailed
    //   · 백필의 LEFT JOIN anti-join — 2분마다, 정상 상태에서 0행이어도 매번 돈다
    //   · ON DELETE SET NULL 강제 스캔 — Postgres 는 참조 컬럼을 자동 인덱싱하지 않는다
    index('contract_archives_signing_idx').on(t.signingContractId),
  ],
);
