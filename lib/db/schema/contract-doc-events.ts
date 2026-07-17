import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contractDocs } from './contract-docs';

// 전자계약 감사 추적 타임라인(별지2) — 발송·열람·서명·재지정·체결·반려·회수·만료.
// audit_logs 와 같은 이유로 actor_user_id 에 FK 를 걸지 않는다: 사용자가
// soft-delete 돼도(users.deletedAt) 이벤트 행은 남아야 한다.
export const contractDocEvents = pgTable(
  'contract_doc_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: uuid('doc_id')
      .notNull()
      .references(() => contractDocs.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorParty: text('actor_party'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('contract_doc_events_doc_created_idx').on(t.docId, t.createdAt)],
);
