// DrizzleChatReadRepository contract — pglite-backed.
//
// chat_conversation_reads tracks per-user read state for a conversation:
//   PK(conversation_id, user_id), last_read_at.
// Backing the unread badge + live read-receipt feature.
//
// Contract under test (per impl-plan 2026-06-02, §리포지토리):
//   - upsert(conversationId, userId, at, tx?): inserts a read row; on repeat
//     call for the same (conversation_id, user_id) it UPDATES last_read_at
//     (idempotent on PK, monotonic value).
//   - getFor(conversationId, userId, tx?): returns the stored row or undefined.

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { chatConversations } from '@/lib/db/schema';
import { DrizzleChatReadRepository } from '../chat-read';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from './_seed';

async function seedConversation(
  db: Awaited<ReturnType<typeof createPgliteDb>>,
): Promise<{ id: string }> {
  const buyer = await seedBuyerWorkspace(db);
  const pg = await seedPgWorkspace(db, 'PG');
  const id = randomUUID();
  await db.insert(chatConversations).values({
    id,
    buyerWsId: buyer.id,
    pgWsId: pg.id,
  });
  return { id };
}

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleChatReadRepository(db);
  const conv = await seedConversation(db);
  const user = await seedUser(db);
  return { db, repo, conv, user };
}

describe('DrizzleChatReadRepository.upsert', () => {
  it('inserts a read row that getFor returns', async () => {
    const { repo, conv, user } = await setup();
    const at = new Date('2026-06-02T10:00:00.000Z');

    await repo.upsert(conv.id, user.id, at);

    const row = await repo.getFor(conv.id, user.id);
    expect(row).toBeDefined();
    expect(row!.conversationId).toBe(conv.id);
    expect(row!.userId).toBe(user.id);
    expect(new Date(row!.lastReadAt).toISOString()).toBe(at.toISOString());
  });

  it('on a repeat call for the same (conversation, user) updates last_read_at instead of inserting a duplicate', async () => {
    const { repo, conv, user } = await setup();
    const first = new Date('2026-06-02T10:00:00.000Z');
    const second = new Date('2026-06-02T10:05:00.000Z');

    await repo.upsert(conv.id, user.id, first);
    await repo.upsert(conv.id, user.id, second);

    const row = await repo.getFor(conv.id, user.id);
    expect(row).toBeDefined();
    expect(new Date(row!.lastReadAt).toISOString()).toBe(second.toISOString());
  });

  it('keeps read state independent per user in the same conversation', async () => {
    const { db, repo, conv, user } = await setup();
    const other = await seedUser(db);
    const userAt = new Date('2026-06-02T10:00:00.000Z');
    const otherAt = new Date('2026-06-02T11:00:00.000Z');

    await repo.upsert(conv.id, user.id, userAt);
    await repo.upsert(conv.id, other.id, otherAt);

    const userRow = await repo.getFor(conv.id, user.id);
    const otherRow = await repo.getFor(conv.id, other.id);
    expect(new Date(userRow!.lastReadAt).toISOString()).toBe(userAt.toISOString());
    expect(new Date(otherRow!.lastReadAt).toISOString()).toBe(otherAt.toISOString());
  });
});

describe('DrizzleChatReadRepository.getFor', () => {
  it('returns undefined when no read row exists for the (conversation, user)', async () => {
    const { repo, conv, user } = await setup();

    const row = await repo.getFor(conv.id, user.id);
    expect(row).toBeUndefined();
  });
});
