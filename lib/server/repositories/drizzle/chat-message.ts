import { asc, eq } from 'drizzle-orm';
import { chatMessages, users } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type {
  ChatMessageRecord,
  ChatMessageRepo,
  ChatMessageWithAuthor,
  Tx,
} from '../types';

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

  async findConversationId(
    messageId: string,
    tx?: Tx,
  ): Promise<{ conversationId: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ conversationId: chatMessages.conversationId })
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);
    return row ?? undefined;
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

  async listByConversationWithAuthor(
    conversationId: string,
    tx?: Tx,
  ): Promise<ChatMessageWithAuthor[]> {
    const db = this.h(tx);
    return (await db
      .select({
        ...MESSAGE_COLUMNS,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(chatMessages)
      .innerJoin(users, eq(users.id, chatMessages.authorUserId))
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt))) as ChatMessageWithAuthor[];
  }
}
