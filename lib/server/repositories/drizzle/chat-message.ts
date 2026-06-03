import { asc, eq } from 'drizzle-orm';
import { chatMessages } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { ChatMessageRecord, ChatMessageRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — guards against schema
// drift where select().from() would compile the full column list.
const MESSAGE_COLUMNS = {
  id: chatMessages.id,
  conversationId: chatMessages.conversationId,
  authorUserId: chatMessages.authorUserId,
  authorWsId: chatMessages.authorWsId,
  body: chatMessages.body,
  rfpId: chatMessages.rfpId,
  createdAt: chatMessages.createdAt,
} as const;

export class DrizzleChatMessageRepository implements ChatMessageRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(msg: ChatMessageRecord, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(chatMessages).values({
      id: msg.id,
      conversationId: msg.conversationId,
      authorUserId: msg.authorUserId,
      authorWsId: msg.authorWsId,
      body: msg.body,
      rfpId: msg.rfpId,
      createdAt: msg.createdAt,
    });
  }

  async listByConversation(
    conversationId: string,
    tx?: Tx,
  ): Promise<ChatMessageRecord[]> {
    const db = this.h(tx);
    return (await db
      .select(MESSAGE_COLUMNS)
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt))) as ChatMessageRecord[];
  }
}
