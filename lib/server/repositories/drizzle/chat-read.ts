import { and, eq, inArray, ne, max } from 'drizzle-orm';
import { chatConversationReads } from '@/lib/db/schema';
import type { ChatConversationRead, ChatReadRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — guards against schema
// drift.
const READ_COLUMNS = {
  conversationId: chatConversationReads.conversationId,
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
    userId: string,
    at: Date,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(chatConversationReads)
      .values({ conversationId, userId, lastReadAt: at })
      .onConflictDoUpdate({
        target: [
          chatConversationReads.conversationId,
          chatConversationReads.userId,
        ],
        set: { lastReadAt: at },
      });
  }

  async getFor(
    conversationId: string,
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
          eq(chatConversationReads.userId, userId),
        ),
      )
      .limit(1);
    return row ?? undefined;
  }

  async getForMany(
    conversationIds: string[],
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
          eq(chatConversationReads.userId, userId),
        ),
      );
  }

  async maxLastReadAt(
    conversationId: string,
    userIds: string[],
    tx?: Tx,
  ): Promise<Date | undefined> {
    // Empty scope means "nobody could have read it" — an unscoped query here
    // would silently widen to every member and fabricate a read receipt.
    if (userIds.length === 0) return undefined;
    const db = this.h(tx);
    const [row] = await db
      .select({ at: max(chatConversationReads.lastReadAt) })
      .from(chatConversationReads)
      .where(
        and(
          eq(chatConversationReads.conversationId, conversationId),
          inArray(chatConversationReads.userId, userIds),
        ),
      );
    return row?.at ? new Date(row.at) : undefined;
  }

  async lastReadByCounterparty(
    conversationId: string,
    viewerUserId: string,
    tx?: Tx,
  ): Promise<Date | undefined> {
    const db = this.h(tx);
    // max(last_read_at) over everyone in the conversation except the viewer —
    // the read-receipt the viewer's own messages have reached.
    const [row] = await db
      .select({ at: max(chatConversationReads.lastReadAt) })
      .from(chatConversationReads)
      .where(
        and(
          eq(chatConversationReads.conversationId, conversationId),
          ne(chatConversationReads.userId, viewerUserId),
        ),
      );
    return row?.at ? new Date(row.at) : undefined;
  }
}
