import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * 사용자 행위 감사 로그 (C5) — "누가 언제 무엇을" 의 영구 기록.
 *
 * 의도적으로 FK가 없다: 워크스페이스/사용자가 삭제(cascade)돼도 감사 행은
 * 남아야 한다 (감사 무결성). actorUserId 는 soft-delete 되는 users 의 uuid,
 * actorWorkspaceId 는 워크스페이스 무관 이벤트(auth.*)에서 null.
 * entityId 는 uuid 와 RFP code(P-2605-0042) 를 모두 담도록 text.
 * 기록은 lib/server/services/* 의 각 작업 트랜잭션 안에서 수행된다.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').notNull(),
    actorWorkspaceId: uuid('actor_workspace_id'),
    // '<도메인>.<행위>' 컨벤션: rfp.award, bid.submit, workspace.member_invite …
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    // 조회 UI(설정 > 활동 기록)의 워크스페이스 스코프 + 최신순 쿼리.
    index('audit_logs_workspace_created_idx').on(t.actorWorkspaceId, t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  ],
);
