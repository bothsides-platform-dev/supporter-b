import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { workspaces } from './workspaces';
import { rfps } from './rfps';

// RFP-scoped internal team thread. Attachments, per-user read-state
// (rfp_team_message_reads), and notifications (in-app + email digest) are
// supported; mentions are not yet. Scope key = (rfp_id, workspace_id): the buyer team and each PG
// team get fully separate threads on the same RFP — rows must never cross the
// workspace boundary (sealed-bid invariant). Append-only; deleting the RFP or
// the workspace cascades the thread away. index backs the ascending scope load.
export const rfpTeamMessages = pgTable(
  'rfp_team_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('rfp_team_messages_scope_idx').on(t.rfpId, t.workspaceId, t.createdAt),
  ],
);
