import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { chatConversations } from './chat-conversations';
import { users } from './users';
import { workspaces } from './workspaces';
import { rfps } from './rfps';

// A single chat message inside a buyer↔PG conversation. author_ws_id records
// which side (buyer vs PG) sent it — derived from the active session workspace
// at send time, not re-derived on read. rfp_id is a nullable context tag: a
// message may reference an RFP (shown as a chip) or be RFP-agnostic. Messages
// are the canonical, self-hosted (Postgres-only) store — Centrifugo never
// persists them, it only fans out. index(conversation_id, created_at) backs the
// ascending thread load.
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    authorWsId: uuid('author_ws_id')
      .notNull()
      .references(() => workspaces.id),
    body: text('body').notNull(),
    // Nullable RFP context tag. onDelete set null so deleting an RFP keeps the
    // message history intact (the tag just drops).
    rfpId: uuid('rfp_id').references(() => rfps.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index('chat_messages_conv_created_idx').on(t.conversationId, t.createdAt)],
);
