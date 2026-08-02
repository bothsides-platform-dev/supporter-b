import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { users } from './users';

/**
 * PG가 자체 PDF 서명칸 배치 에디터로 만들어 스노우싸인에 등록한 계약서 템플릿.
 * 역할은 항상 구매사/PG 둘로 고정되고(에디터가 배치 시점에 태그), 변수 치환은
 * 쓰지 않는다 — 옛 pg_signing_templates(v0.4.37.0에서 폐지) 대비 roleMapping/
 * variableMapping 컬럼이 없다.
 */
export const pgSigningTemplates = pgTable(
  'pg_signing_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    snowsignTemplateId: text('snowsign_template_id').notNull(),
    name: text('name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('pg_signing_templates_ws_template_uniq').on(t.workspaceId, t.snowsignTemplateId),
    index('pg_signing_templates_ws_idx').on(t.workspaceId),
  ],
);
