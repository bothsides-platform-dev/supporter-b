// DrizzleChatMessageRepository.listByConversationWithAuthor — pglite-backed.
// Joins users to surface the author's current name/email per message (the
// team-chat listByScope precedent). Keeps created_at asc.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleChatConversationRepository } from '../chat-conversation';
import { DrizzleChatMessageRepository } from '../chat-message';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from './_seed';

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
