import { pgTable, uuid, timestamp, primaryKey, foreignKey } from 'drizzle-orm/pg-core';
import { chatConversations } from './chat-conversations';
import { users } from './users';
import { workspaces } from './workspaces';

// Per-workspace-member read state for a conversation — backs the unread badge
// and the live read-receipt feature. A user can belong to both sides of the
// same conversation, so workspace_id is part of the identity rather than being
// inferred later from membership. last_read_at advances monotonically.
export const chatConversationReads = pgTable(
  'chat_conversation_reads',
  {
    conversationId: uuid('conversation_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.workspaceId, t.userId] }),
    // Explicit names keep constraint identifiers within Postgres's 63-byte limit.
    foreignKey({
      name: 'ccr_conversation_id_fk',
      columns: [t.conversationId],
      foreignColumns: [chatConversations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ccr_workspace_id_fk',
      columns: [t.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ccr_user_id_fk',
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
  ],
);
