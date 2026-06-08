import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAttachmentRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
  getNotificationRepo,
  getOutboxRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { chatMessages, notifications, outboxEntries } from '@/lib/db/schema';
import { ChatService } from '../chat';
import type { PgliteDB } from '@/lib/db/client-pglite';

// Best-effort centrifugo calls must not block tests.
vi.mock('@/lib/server/realtime/centrifugo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../realtime/centrifugo')>();
  return {
    ...actual,
    publishChatEvent: vi.fn().mockResolvedValue(undefined),
    isUserPresentInConversation: vi.fn().mockResolvedValue(false),
  };
});

let db: PgliteDB;
let service: ChatService;

async function buildService(): Promise<ChatService> {
  const [convRepo, wsRepo, userRepo, attRepo, msgRepo, notifRepo, outboxRepo, readRepo] =
    await Promise.all([
      getChatConversationRepo(),
      getWorkspaceRepo(),
      getUserRepo(),
      getAttachmentRepo(),
      getChatMessageRepo(),
      getNotificationRepo(),
      getOutboxRepo(),
      getChatReadRepo(),
    ]);
  return new ChatService(db, convRepo, wsRepo, userRepo, attRepo, msgRepo, notifRepo, outboxRepo, readRepo);
}

async function seedPair() {
  const buyerUser = await seedUser(db, { email: 'buyer@chat.com', name: '구매사담당' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@chat.com', name: 'PG영업' });
  const pgWs = await seedPgWorkspace(db, 'PG', { name: 'OO페이' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  return { buyerUser, buyerWs, pgUser, pgWs };
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});

afterEach(() => {
  __resetForTest();
  vi.clearAllMocks();
});

describe('ChatService.sendMessage', () => {
  it('persists a message and creates a conversation for a buyer→PG pair', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();

    const result = await service.sendMessage(
      {
        counterpartyWorkspaceId: pgWs.id,
        body: '안녕하세요, 견적 문의드립니다.',
        attachmentIds: [],
      },
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const messages = await db.select().from(chatMessages);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('안녕하세요, 견적 문의드립니다.');
    expect(messages[0].authorUserId).toBe(buyerUser.id);
    expect(messages[0].conversationId).toBe(result.conversationId);
  });

  it('dispatches an in-app notification to the counterparty member', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();

    const result = await service.sendMessage(
      {
        counterpartyWorkspaceId: pgWs.id,
        body: '테스트 메시지',
        attachmentIds: [],
      },
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );

    expect(result.ok).toBe(true);
    const notifs = await db.select().from(notifications);
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].type).toBe('chat.message');
  });

  it('enqueues a windowed-digest outbox row for the offline counterparty', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();

    await service.sendMessage(
      {
        counterpartyWorkspaceId: pgWs.id,
        body: '이메일 아웃박스 테스트',
        attachmentIds: [],
      },
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );

    const outbox = await db.select().from(outboxEntries);
    expect(outbox.length).toBeGreaterThan(0);
    expect(outbox[0].event).toBe('chat.message');
  });

  it('reuses an existing conversation for the same buyer↔PG pair', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    const actor = { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' as const };

    const r1 = await service.sendMessage(
      { counterpartyWorkspaceId: pgWs.id, body: '첫 번째', attachmentIds: [] },
      actor,
    );
    const r2 = await service.sendMessage(
      { counterpartyWorkspaceId: pgWs.id, body: '두 번째', attachmentIds: [] },
      actor,
    );

    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.conversationId).toBe(r2.conversationId);

    const messages = await db.select().from(chatMessages);
    expect(messages).toHaveLength(2);
  });

  it('returns CONVERSATION_NOT_FOUND for an unknown conversationId', async () => {
    const { buyerUser, buyerWs } = await seedPair();

    const result = await service.sendMessage(
      {
        conversationId: '00000000-0000-0000-0000-000000000000',
        body: '없는 대화',
        attachmentIds: [],
      },
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );

    expect(result).toEqual({ ok: false, error: 'CONVERSATION_NOT_FOUND' });
  });

  it('returns FORBIDDEN when session workspace is not a member of the conversation', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();

    // Create a conversation as buyer
    const r = await service.sendMessage(
      { counterpartyWorkspaceId: pgWs.id, body: '초기', attachmentIds: [] },
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );
    if (!r.ok) throw new Error('setup failed');

    // Another buyer workspace tries to use this conversation
    const otherBuyerUser = await seedUser(db, { email: 'other@buyer.com' });
    const otherBuyerWs = await seedBuyerWorkspace(db, { name: '다른구매사' });
    await seedMembership(db, otherBuyerWs.id, otherBuyerUser.id, 'admin');

    const result = await service.sendMessage(
      { conversationId: r.conversationId, body: '침입', attachmentIds: [] },
      { userId: otherBuyerUser.id, workspaceId: otherBuyerWs.id, workspaceType: 'buyer' },
    );

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('returns INVALID_COUNTERPARTY when same workspace type tries to message each other', async () => {
    const pgUser = await seedUser(db, { email: 'pg1@test.com' });
    const pgWs1 = await seedPgWorkspace(db, 'pg1');
    await seedMembership(db, pgWs1.id, pgUser.id, 'admin');

    const pgUser2 = await seedUser(db, { email: 'pg2@test.com' });
    const pgWs2 = await seedPgWorkspace(db, 'pg2');
    await seedMembership(db, pgWs2.id, pgUser2.id, 'admin');

    const result = await service.sendMessage(
      { counterpartyWorkspaceId: pgWs2.id, body: 'PG끼리', attachmentIds: [] },
      { userId: pgUser.id, workspaceId: pgWs1.id, workspaceType: 'pg' },
    );

    expect(result).toEqual({ ok: false, error: 'INVALID_COUNTERPARTY' });
  });

  it('returns INVALID_INPUT when body is empty and no attachments', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();

    const result = await service.sendMessage(
      { counterpartyWorkspaceId: pgWs.id, body: '   ', attachmentIds: [] },
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});

describe('ChatService.markConversationRead', () => {
  it('upserts last_read_at for a conversation member', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    const actor = { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' as const };

    // First send a message to create the conversation
    const sendResult = await service.sendMessage(
      { counterpartyWorkspaceId: pgWs.id, body: '안녕', attachmentIds: [] },
      actor,
    );
    if (!sendResult.ok) throw new Error('setup failed');

    const result = await service.markConversationRead(sendResult.conversationId, actor);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.readAt).toBeTruthy();
  });

  it('returns CONVERSATION_NOT_FOUND for an unknown conversation', async () => {
    const { buyerUser, buyerWs } = await seedPair();

    const result = await service.markConversationRead(
      '00000000-0000-0000-0000-000000000000',
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );

    expect(result).toEqual({ ok: false, error: 'CONVERSATION_NOT_FOUND' });
  });

  it('returns FORBIDDEN for a non-member conversation', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();

    // Create a conversation
    const r = await service.sendMessage(
      { counterpartyWorkspaceId: pgWs.id, body: '안녕', attachmentIds: [] },
      { userId: buyerUser.id, workspaceId: buyerWs.id, workspaceType: 'buyer' },
    );
    if (!r.ok) throw new Error('setup failed');

    // Stranger tries to read
    const stranger = await seedUser(db, { email: 'stranger@test.com' });
    const strangerWs = await seedBuyerWorkspace(db, { name: '침입자' });
    await seedMembership(db, strangerWs.id, stranger.id, 'admin');

    const result = await service.markConversationRead(r.conversationId, {
      userId: stranger.id,
      workspaceId: strangerWs.id,
      workspaceType: 'buyer',
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
