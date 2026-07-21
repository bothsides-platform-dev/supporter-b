import { pgTable, uuid, timestamp, primaryKey, text, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { memberRoleEnum } from './_enums';
import { workspaces } from './workspaces';
import { users } from './users';
import type { MemberApprovalStatus } from '@/lib/types/workspace';

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('member'),
    // `$type` narrows the inferred `string` to the canonical union so callers
    // need no `as MemberApprovalStatus` cast — and, more importantly, dropping
    // this column from a repo projection becomes a compile error instead of a
    // silent `undefined` that flips `isApprovedAdmin` to false.
    approvalStatus: text('approval_status')
      .$type<MemberApprovalStatus>()
      .notNull()
      .default('approved'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().default(sql`now()`),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    // `role` is a real pg enum; `approval_status` is text, and the admin console
    // that writes it lives in a separate repo (`admin-supporter-b`) with no
    // shared types. A drifted value makes `isApprovedAdmin` false, which is
    // fail-OPEN at the deleteAccount last-admin block (workspace orphaning).
    // This CHECK is the one place both repos are forced through.
    check(
      'workspace_members_approval_status_check',
      sql`${t.approvalStatus} in ('approved','pending_approval','rejected')`,
    ),
    index('workspace_members_user_idx').on(t.userId),
  ],
);
