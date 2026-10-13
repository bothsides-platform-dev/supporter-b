import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { chatMessages, notifications, outboxEntries } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getChatConversationRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getChatService } from '../chat';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://centrifugo.test/api');
  vi.stubEnv('CENTRIFUGO_API_KEY', 'test-key');
});

afterEach(() => {
  __resetForTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function seedConversation() {
  const buyer = await seedUser(db);
  const buyerWs = await seedBuyerWorkspace(db);
  const pgWs = await seedPgWorkspace(db, 'PG');
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const conversation = await (await getChatConversationRepo()).findOrCreatePair(buyerWs.id, pgWs.id);
  return {
    buyer,
    pgWs,
    conversation,
    actor: { userId: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer' as const },
  };
}

describe('ChatService presence fallback', () => {
  it.each(['missing', 'pending_approval', 'rejected', 'sender-only'] as const)(
    'skips the realtime request when approved recipients excluding the sender are %s',
    async (membership) => {
      const { buyer, pgWs, conversation, actor } = await seedConversation();
      if (membership === 'sender-only') {
        await seedMembership(db, pgWs.id, buyer.id);
      } else if (membership !== 'missing') {
        const user = await seedUser(db);
        await seedMembership(db, pgWs.id, user.id, 'member', { approvalStatus: membership });
      }
      const fetchSpy = vi.fn().mockRejectedValue(new Error('Realtime must not be called'));
      vi.stubGlobal('fetch', fetchSpy);

      const result = await (await getChatService()).sendMessage(
        { conversationId: conversation.id, body: '수신자 없는 메시지', attachmentIds: [] },
        actor,
      );

      expect(result.ok).toBe(true);
      expect(await db.select().from(chatMessages)).toHaveLength(1);
      expect(await db.select().from(notifications)).toHaveLength(0);
      expect(await db.select().from(outboxEntries)).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('persists the message and queues the offline recipient digest after presence times out', async () => {
    const { pgWs, conversation, actor } = await seedConversation();
    const recipient = await seedUser(db);
    await seedMembership(db, pgWs.id, recipient.id);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
      return controller.signal;
    });
    const started = Promise.withResolvers<void>();
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal;
      started.resolve();
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
      });
    }));

    const pending = (await getChatService()).sendMessage(
      { conversationId: conversation.id, body: '접속 조회 장애 중 메시지', attachmentIds: [] },
      actor,
    );
    await started.promise;
    expect(await db.select().from(chatMessages)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(requestSignal?.aborted).toBe(true);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(await db.select().from(chatMessages)).toMatchObject([
      { body: '접속 조회 장애 중 메시지', conversationId: conversation.id },
    ]);
    expect(await db.select().from(notifications)).toMatchObject([
      { userId: recipient.id, type: 'chat.message' },
    ]);
    expect(await db.select().from(outboxEntries)).toMatchObject([
      { toAddr: recipient.email, event: 'chat.message', status: 'pending' },
    ]);
  });
});
