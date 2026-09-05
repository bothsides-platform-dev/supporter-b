import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const workspaceNameChangeRequests = pgTable(
  'workspace_name_change_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 워크스페이스가 삭제돼도 심사 이력은 남아야 하므로 FK를 두지 않는다.
    workspaceId: uuid('workspace_id').notNull(),
    // 감사 이력은 탈퇴 사용자보다 오래 살아야 하므로 users FK를 두지 않는다.
    requestedByUserId: uuid('requested_by_user_id').notNull(),
    currentName: text('current_name').notNull(),
    requestedName: text('requested_name').notNull(),
    status: text('status').notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reason: text('reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(sql`now()`),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [
    check('workspace_name_change_requests_status_chk', sql`${t.status} IN ('pending', 'approved', 'rejected')`),
    check('workspace_name_change_requests_name_changed_chk', sql`${t.currentName} <> ${t.requestedName}`),
    uniqueIndex('workspace_name_change_requests_one_pending_uniq').on(t.workspaceId).where(sql`${t.status} = 'pending'`),
    index('workspace_name_change_requests_workspace_submitted_idx').on(t.workspaceId, t.submittedAt, t.id),
    index('workspace_name_change_requests_status_submitted_idx').on(t.status, t.submittedAt, t.id),
  ],
);
