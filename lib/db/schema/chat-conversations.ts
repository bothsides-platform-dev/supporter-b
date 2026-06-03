import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';

// Realtime chat — one conversation per buyer↔PG workspace pair (RFP-agnostic;
// RFP shows only as a per-message tag). The buyer_ws_id must be a buyer and
// pg_ws_id a PG — that type invariant is enforced in the action layer (FK alone
// cannot express it). The unique(buyer_ws_id, pg_ws_id) makes findOrCreatePair
// idempotent. PG↔PG / buyer↔buyer conversations are impossible by construction,
// preserving the complete-privacy (비공개) invariant.
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyerWsId: uuid('buyer_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Inbox sort key. Nullable so a freshly created pair (no messages yet) is
    // valid; touched on each message send.
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [uniqueIndex('chat_conversations_pair_uniq').on(t.buyerWsId, t.pgWsId)],
);
