import { pgTable, uuid, timestamp, primaryKey, foreignKey } from 'drizzle-orm/pg-core';
import { chatConversations } from './chat-conversations';
import { users } from './users';

// Per-user read state for a conversation — backs the unread badge and the live
// read-receipt feature. PK(conversation_id, user_id) makes upsert idempotent;
// last_read_at advances monotonically as the user reads.
export const chatConversationReads = pgTable(
  'chat_conversation_reads',
  {
    conversationId: uuid('conversation_id').notNull(),
    userId: uuid('user_id').notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    // Explicit names keep constraint identifiers within Postgres's 63-byte limit.
    foreignKey({
      name: 'ccr_conversation_id_fk',
      columns: [t.conversationId],
      foreignColumns: [chatConversations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ccr_user_id_fk',
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
  ],
);
