// DrizzleChatMessageRepository.listByConversationWithAuthor — pglite-backed.
// Joins users to surface the author's current name/email per message (the
// team-chat listByScope precedent). Keeps created_at asc.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleChatConversationRepository } from '../chat-conversation';
import { DrizzleChatMessageRepository } from '../chat-message';
import { seedBuyerWorkspace, seedPgWorkspace, seedRfp, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const convRepo = new DrizzleChatConversationRepository(db);
  const msgRepo = new DrizzleChatMessageRepository(db);
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  const pgWs = await seedPgWorkspace(db, 'PG', { name: 'OO페이' });
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '구매사담당' });
  const pgUser = await seedUser(db, { email: 'sales@pg.com', name: 'PG영업' });
  return { db, convRepo, msgRepo, buyerWs, pgWs, buyerUser, pgUser };
}

describe('DrizzleChatMessageRepository.listByConversationWithAuthor', () => {
  it('returns each message with the author name/email joined, created_at asc', async () => {
    const { convRepo, msgRepo, buyerWs, pgWs, buyerUser, pgUser } = await setup();
    const conv = await convRepo.findOrCreatePair(buyerWs.id, pgWs.id);

    await msgRepo.save({
      id: randomUUID(),
      conversationId: conv.id,
      authorUserId: buyerUser.id,
      authorWsId: buyerWs.id,
      body: 'buyer first',
      rfpId: null,
      createdAt: new Date('2026-05-26T05:00:00.000Z'),
    });
    await msgRepo.save({
      id: randomUUID(),
      conversationId: conv.id,
      authorUserId: pgUser.id,
      authorWsId: pgWs.id,
      body: 'pg reply',
      rfpId: null,
      createdAt: new Date('2026-05-26T05:01:00.000Z'),
    });

    const rows = await msgRepo.listByConversationWithAuthor(conv.id);

    expect(rows.map((r) => r.body)).toEqual(['buyer first', 'pg reply']);
    expect(rows.map((r) => r.authorName)).toEqual(['구매사담당', 'PG영업']);
    expect(rows.map((r) => r.authorEmail)).toEqual(['buyer@b.com', 'sales@pg.com']);
    expect(rows.map((r) => r.authorUserId)).toEqual([buyerUser.id, pgUser.id]);
  });
});

// The conversation-list loader needs only the LAST message per conversation
// (preview text, unread comparison, rfp link). It used to call
// listByConversation per row and take msgs.at(-1) — pulling every message of
// every conversation over the wire to use one. This returns just the tail, for
// every conversation, in one query.
describe('DrizzleChatMessageRepository.lastByConversations', () => {
  async function twoConversations() {
    const base = await setup();
    const { db, convRepo, buyerWs } = base;
    const pgB = await seedPgWorkspace(db, 'PGB', { name: '두번째PG' });
    const convA = await convRepo.findOrCreatePair(buyerWs.id, base.pgWs.id);
    const convB = await convRepo.findOrCreatePair(buyerWs.id, pgB.id);
    return { ...base, convA, convB };
  }

  it('returns the newest message for each conversation, one row per conversation', async () => {
    const { msgRepo, buyerWs, buyerUser, convA, convB } = await twoConversations();
    const mk = (conversationId: string, body: string, iso: string) => ({
      id: randomUUID(),
      conversationId,
      authorUserId: buyerUser.id,
      authorWsId: buyerWs.id,
      body,
      rfpId: null,
      createdAt: new Date(iso),
    });
    await msgRepo.save(mk(convA.id, 'A old', '2026-05-26T05:00:00.000Z'));
    await msgRepo.save(mk(convA.id, 'A newest', '2026-05-26T05:02:00.000Z'));
    await msgRepo.save(mk(convA.id, 'A middle', '2026-05-26T05:01:00.000Z'));
    await msgRepo.save(mk(convB.id, 'B newest', '2026-05-26T04:00:00.000Z'));

    const rows = await msgRepo.lastByConversations([convA.id, convB.id]);

    expect(rows).toHaveLength(2);
    const byConv = new Map(rows.map((r) => [r.conversationId, r]));
    expect(byConv.get(convA.id)!.body).toBe('A newest');
    expect(byConv.get(convB.id)!.body).toBe('B newest');
  });

  it('carries the fields the list loader renders — authorWsId and rfpId', async () => {
    const { db, msgRepo, convRepo, buyerWs, pgWs, buyerUser, pgUser } = await setup();
    const conv = await convRepo.findOrCreatePair(buyerWs.id, pgWs.id);
    const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });
    await msgRepo.save({
      id: randomUUID(),
      conversationId: conv.id,
      authorUserId: pgUser.id,
      authorWsId: pgWs.id,
      body: 'from pg',
      rfpId: rfp.id,
      createdAt: new Date('2026-05-26T05:00:00.000Z'),
    });

    const [row] = await msgRepo.lastByConversations([conv.id]);

    expect(row.authorWsId).toBe(pgWs.id);
    expect(row.rfpId).toBe(rfp.id);
    expect(row.body).toBe('from pg');
  });

  it('omits conversations that have no messages', async () => {
    const { msgRepo, buyerWs, buyerUser, convA, convB } = await twoConversations();
    await msgRepo.save({
      id: randomUUID(),
      conversationId: convA.id,
      authorUserId: buyerUser.id,
      authorWsId: buyerWs.id,
      body: 'only A',
      rfpId: null,
      createdAt: new Date('2026-05-26T05:00:00.000Z'),
    });

    const rows = await msgRepo.lastByConversations([convA.id, convB.id]);

    expect(rows.map((r) => r.conversationId)).toEqual([convA.id]);
  });

  it('does not bleed a message from a conversation outside the requested set', async () => {
    const { msgRepo, buyerWs, buyerUser, convA, convB } = await twoConversations();
    await msgRepo.save({
      id: randomUUID(),
      conversationId: convB.id,
      authorUserId: buyerUser.id,
      authorWsId: buyerWs.id,
      body: 'B only',
      rfpId: null,
      createdAt: new Date('2026-05-26T05:00:00.000Z'),
    });

    const rows = await msgRepo.lastByConversations([convA.id]);

    expect(rows).toEqual([]);
  });

  it('returns [] for an empty id list without querying', async () => {
    const { msgRepo } = await setup();
    await expect(msgRepo.lastByConversations([])).resolves.toEqual([]);
  });
});

describe('DrizzleChatMessageRepository.findConversationId', () => {
  it('returns the conversationId for a known message', async () => {
    const { convRepo, msgRepo, buyerWs, pgWs, buyerUser } = await setup();
    const conv = await convRepo.findOrCreatePair(buyerWs.id, pgWs.id);
    const msgId = randomUUID();
    await msgRepo.save({
      id: msgId,
      conversationId: conv.id,
      authorUserId: buyerUser.id,
      authorWsId: buyerWs.id,
      body: 'hi',
      rfpId: null,
      createdAt: new Date('2026-05-26T05:00:00.000Z'),
    });
    expect(await msgRepo.findConversationId(msgId)).toEqual({ conversationId: conv.id });
  });

  it('returns undefined for an unknown message', async () => {
    const { msgRepo } = await setup();
    expect(await msgRepo.findConversationId(randomUUID())).toBeUndefined();
  });
});
