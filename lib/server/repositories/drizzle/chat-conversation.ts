import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { chatConversations } from '@/lib/db/schema';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { ChatConversation, ChatConversationRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — guards against schema
// drift where select().from() would compile the full column list.
const CONVERSATION_COLUMNS = {
  id: chatConversations.id,
  buyerWsId: chatConversations.buyerWsId,
  pgWsId: chatConversations.pgWsId,
  lastMessageAt: chatConversations.lastMessageAt,
  createdAt: chatConversations.createdAt,
} as const;

export class DrizzleChatConversationRepository implements ChatConversationRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async findOrCreatePair(
    buyerWsId: string,
    pgWsId: string,
    tx?: Tx,
  ): Promise<ChatConversation> {
    const db = this.h(tx);
    // Idempotent on the (buyer_ws_id, pg_ws_id) unique. ON CONFLICT DO NOTHING
    // then read back — race-safe under concurrent first-send.
    await db
      .insert(chatConversations)
      .values({ id: randomUUID(), buyerWsId, pgWsId })
      .onConflictDoNothing({
        target: [chatConversations.buyerWsId, chatConversations.pgWsId],
      });
    const [row] = await db
      .select(CONVERSATION_COLUMNS)
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.buyerWsId, buyerWsId),
          eq(chatConversations.pgWsId, pgWsId),
        ),
      )
      .limit(1);
    return row as ChatConversation;
  }

  async findPair(
    buyerWsId: string,
    pgWsId: string,
    tx?: Tx,
  ): Promise<ChatConversation | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select(CONVERSATION_COLUMNS)
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.buyerWsId, buyerWsId),
          eq(chatConversations.pgWsId, pgWsId),
        ),
      )
      .limit(1);
    return row as ChatConversation | undefined;
  }

  async findById(id: string, tx?: Tx): Promise<ChatConversation | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select(CONVERSATION_COLUMNS)
      .from(chatConversations)
      .where(eq(chatConversations.id, id))
      .limit(1);
    return (row as ChatConversation) ?? undefined;
  }

  async listForWorkspace(
    wsId: string,
    viewerType: WorkspaceType,
    tx?: Tx,
  ): Promise<ChatConversation[]> {
    const db = this.h(tx);
    // The viewer's workspace type fixes which side column to match — preserving
    // the private ACL (a pg viewer never sees the buyer side and vice versa).
    const sideMatch =
      viewerType === 'buyer'
        ? eq(chatConversations.buyerWsId, wsId)
        : eq(chatConversations.pgWsId, wsId);
    return (await db
      .select(CONVERSATION_COLUMNS)
      .from(chatConversations)
      .where(sideMatch)
      // last_message_at desc, nulls last (fresh pair with no messages sinks).
      .orderBy(
        sql`${chatConversations.lastMessageAt} DESC NULLS LAST`,
        desc(chatConversations.createdAt),
      )) as ChatConversation[];
  }

  async touchLastMessageAt(id: string, at: Date, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(chatConversations)
      .set({ lastMessageAt: at })
      .where(eq(chatConversations.id, id));
  }
}
