import { pgTable, uuid, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { memberRoleEnum } from './_enums';
import { workspaces } from './workspaces';
import { users } from './users';

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
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().default(sql`now()`),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    // PK leftmost-prefix covers (workspace_id); user_id needs its own index so
    // user-delete cascade and member→user lookups don't seq-scan.
    index('workspace_members_user_idx').on(t.userId),
  ],
);
