import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { chatConversationReads } from '@/lib/db/schema';
import type { ChatConversationRead, ChatReadRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — guards against schema
// drift.
const READ_COLUMNS = {
  conversationId: chatConversationReads.conversationId,
  workspaceId: chatConversationReads.workspaceId,
  userId: chatConversationReads.userId,
  lastReadAt: chatConversationReads.lastReadAt,
} as const;

export class DrizzleChatReadRepository implements ChatReadRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async upsert(
    conversationId: string,
    workspaceId: string,
    userId: string,
    at: Date,
    tx?: Tx,
  ): Promise<Date> {
    const db = this.h(tx);
    const [row] = await db
      .insert(chatConversationReads)
      .values({ conversationId, workspaceId, userId, lastReadAt: at })
      .onConflictDoUpdate({
        target: [
          chatConversationReads.conversationId,
          chatConversationReads.workspaceId,
          chatConversationReads.userId,
        ],
        set: {
          lastReadAt: sql`greatest(${chatConversationReads.lastReadAt}, excluded.last_read_at)`,
        },
      })
      .returning({ lastReadAt: chatConversationReads.lastReadAt });
    return new Date(row.lastReadAt);
  }

  async getFor(
    conversationId: string,
    workspaceId: string,
    userId: string,
    tx?: Tx,
  ): Promise<ChatConversationRead | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select(READ_COLUMNS)
      .from(chatConversationReads)
      .where(
        and(
          eq(chatConversationReads.conversationId, conversationId),
          eq(chatConversationReads.workspaceId, workspaceId),
          eq(chatConversationReads.userId, userId),
        ),
      )
      .limit(1);
    return row ?? undefined;
  }

  async getForMany(
    conversationIds: string[],
    workspaceId: string,
    userId: string,
    tx?: Tx,
  ): Promise<ChatConversationRead[]> {
    if (conversationIds.length === 0) return [];
    const db = this.h(tx);
    return await db
      .select(READ_COLUMNS)
      .from(chatConversationReads)
      .where(
        and(
          inArray(chatConversationReads.conversationId, conversationIds),
          eq(chatConversationReads.workspaceId, workspaceId),
          eq(chatConversationReads.userId, userId),
        ),
      );
  }

  async maxLastReadAt(
    conversationId: string,
    workspaceId: string,
    tx?: Tx,
  ): Promise<Date | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ at: max(chatConversationReads.lastReadAt) })
      .from(chatConversationReads)
      .where(
        and(
          eq(chatConversationReads.conversationId, conversationId),
          eq(chatConversationReads.workspaceId, workspaceId),
        ),
      );
    return row?.at ? new Date(row.at) : undefined;
  }
}
