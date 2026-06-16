import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { users } from './users';

// Per-user read state for an RFP team thread — backs the team-chat unread badge
// in the unified inbox. Scope mirrors rfp_team_messages (rfp_id, workspace_id):
// the buyer team and each PG team keep fully separate read cursors on the same
// RFP. PK(rfp_id, workspace_id, user_id) makes upsert idempotent; last_read_at
// advances monotonically. Cascades away with the RFP/workspace/user.
export const rfpTeamMessageReads = pgTable(
  'rfp_team_message_reads',
  {
    rfpId: uuid('rfp_id').notNull().references(() => rfps.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.rfpId, t.workspaceId, t.userId] })],
);
