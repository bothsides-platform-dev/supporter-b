import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { users } from './users';

// PG 워크스페이스가 보유한 계약서 템플릿(메타만). 실제 PDF 바이트는
// attachments 테이블의 exclusive-arc 6번째 컬럼(contract_template_id)으로
// 연결된다 — 이 테이블 자체는 파일을 소유하지 않는다. 발송 가능하려면 ready
// 첨부가 최소 1개 있어야 한다(서비스 레이어 게이트, lib/types/contract-doc.ts
// ContractTemplate.attachment).
export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('contract_templates_pg_ws_idx').on(t.pgWsId)],
);
