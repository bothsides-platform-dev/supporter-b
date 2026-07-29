import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { users } from './users';
import type { SigningParticipantRole } from '@/lib/types/signing';

/**
 * PG가 자사 계약서를 SnowSign 템플릿으로 1회 등록해 워크스페이스에 링크한 것.
 * 앱 하나의 SnowSign org(단일 API key) 안에서 org 스코핑의 진실 원천 — PG는
 * 이 표에 링크된 template_id 만 접근한다(`GET /v1/templates` 원본을 노출하지 않음).
 *
 * 워크스페이스 "기본 템플릿" 개념은 없다 — 어떤 계약서를 쓸지는 견적별로
 * (`bids.signing_template_id`) 고르고, 발송 직전 딜룸에서 PG가 최종 확인한다.
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
    roleMapping: jsonb('role_mapping').$type<Record<string, SigningParticipantRole>>().notNull(),
    variableMapping: jsonb('variable_mapping')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
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
