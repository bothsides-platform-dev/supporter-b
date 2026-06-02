import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { chatConversations } from './chat-conversations';
import { users } from './users';

// Per-user read state for a conversation — backs the unread badge and the live
// read-receipt feature. PK(conversation_id, user_id) makes upsert idempotent;
// last_read_at advances monotonically as the user reads.
export const chatConversationReads = pgTable(
  'chat_conversation_reads',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
  ],
);
