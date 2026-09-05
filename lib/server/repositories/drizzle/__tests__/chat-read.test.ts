// DrizzleChatReadRepository contract — pglite-backed.
//
// chat_conversation_reads tracks per-workspace-member read state:
//   PK(conversation_id, workspace_id, user_id), last_read_at.
// Backing the unread badge + live read-receipt feature.
//
// Contract under test (per impl-plan 2026-06-02, §리포지토리):
//   - upsert(conversationId, workspaceId, userId, at, tx?): inserts a read row;
//     on repeat call for the same composite key it UPDATES last_read_at
//     (idempotent on PK, monotonic value).
//   - getFor(conversationId, workspaceId, userId, tx?): returns the stored row.

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { chatConversations } from '@/lib/db/schema';
import { DrizzleChatReadRepository } from '../chat-read';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from './_seed';

async function seedConversation(
  db: Awaited<ReturnType<typeof createPgliteDb>>,
): Promise<{ id: string; buyerWsId: string; pgWsId: string }> {
  const buyer = await seedBuyerWorkspace(db);
  const pg = await seedPgWorkspace(db, 'PG');
  const id = randomUUID();
  await db.insert(chatConversations).values({
    id,
    buyerWsId: buyer.id,
    pgWsId: pg.id,
  });
  return { id, buyerWsId: buyer.id, pgWsId: pg.id };
}

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleChatReadRepository(db);
  const conv = await seedConversation(db);
  const user = await seedUser(db);
  return { db, repo, conv, user };
}

describe('DrizzleChatReadRepository.upsert', () => {
  it('keeps the same user read state isolated by workspace', async () => {
    const { repo, conv, user } = await setup();
    const buyerAt = new Date('2026-06-02T10:00:00.000Z');
    const pgAt = new Date('2026-06-02T11:00:00.000Z');

    await repo.upsert(conv.id, conv.buyerWsId, user.id, buyerAt);
    await repo.upsert(conv.id, conv.pgWsId, user.id, pgAt);

    const buyerRow = await repo.getFor(conv.id, conv.buyerWsId, user.id);
    const pgRow = await repo.getFor(conv.id, conv.pgWsId, user.id);
    expect(buyerRow?.workspaceId).toBe(conv.buyerWsId);
    expect(buyerRow?.lastReadAt.toISOString()).toBe(buyerAt.toISOString());
    expect(pgRow?.workspaceId).toBe(conv.pgWsId);
    expect(pgRow?.lastReadAt.toISOString()).toBe(pgAt.toISOString());
  });

  it('inserts a read row that getFor returns', async () => {
    const { repo, conv, user } = await setup();
    const at = new Date('2026-06-02T10:00:00.000Z');

    await repo.upsert(conv.id, conv.buyerWsId, user.id, at);

    const row = await repo.getFor(conv.id, conv.buyerWsId, user.id);
    expect(row).toBeDefined();
    expect(row!.conversationId).toBe(conv.id);
    expect(row!.userId).toBe(user.id);
    expect(new Date(row!.lastReadAt).toISOString()).toBe(at.toISOString());
  });

  it('on a repeat call for the same (conversation, user) updates last_read_at instead of inserting a duplicate', async () => {
    const { repo, conv, user } = await setup();
    const first = new Date('2026-06-02T10:00:00.000Z');
    const second = new Date('2026-06-02T10:05:00.000Z');

    await repo.upsert(conv.id, conv.buyerWsId, user.id, first);
    await repo.upsert(conv.id, conv.buyerWsId, user.id, second);

    const row = await repo.getFor(conv.id, conv.buyerWsId, user.id);
    expect(row).toBeDefined();
    expect(new Date(row!.lastReadAt).toISOString()).toBe(second.toISOString());
  });

  it('나중에 도착한 오래된 시각으로 last_read_at을 뒤로 돌리지 않는다', async () => {
    const { repo, conv, user } = await setup();
    const later = new Date('2026-06-02T10:05:00.000Z');
    const earlier = new Date('2026-06-02T10:00:00.000Z');

    await repo.upsert(conv.id, conv.buyerWsId, user.id, later);
    await repo.upsert(conv.id, conv.buyerWsId, user.id, earlier);

    const row = await repo.getFor(conv.id, conv.buyerWsId, user.id);
    expect(new Date(row!.lastReadAt).toISOString()).toBe(later.toISOString());
  });

  it('keeps read state independent per user in the same conversation', async () => {
    const { db, repo, conv, user } = await setup();
    const other = await seedUser(db);
    const userAt = new Date('2026-06-02T10:00:00.000Z');
    const otherAt = new Date('2026-06-02T11:00:00.000Z');

    await repo.upsert(conv.id, conv.buyerWsId, user.id, userAt);
    await repo.upsert(conv.id, conv.buyerWsId, other.id, otherAt);

    const userRow = await repo.getFor(conv.id, conv.buyerWsId, user.id);
    const otherRow = await repo.getFor(conv.id, conv.buyerWsId, other.id);
    expect(new Date(userRow!.lastReadAt).toISOString()).toBe(userAt.toISOString());
    expect(new Date(otherRow!.lastReadAt).toISOString()).toBe(otherAt.toISOString());
  });
});

describe('DrizzleChatReadRepository.getFor', () => {
  it('returns undefined when no read row exists for the (conversation, user)', async () => {
    const { repo, conv, user } = await setup();

    const row = await repo.getFor(conv.id, conv.buyerWsId, user.id);
    expect(row).toBeUndefined();
  });
});

// Batch reads — these exist so the conversation-list loader can resolve read
// state for every conversation in ONE round trip instead of one per row.
describe('DrizzleChatReadRepository.getForMany', () => {
  it('returns one row per (conversation, user) that has read state, keyed by conversation', async () => {
    const { db, repo, conv, user } = await setup();
    const convB = await seedConversation(db);
    const atA = new Date('2026-06-02T10:00:00.000Z');
    const atB = new Date('2026-06-02T11:00:00.000Z');

    await repo.upsert(conv.id, conv.buyerWsId, user.id, atA);
    await repo.upsert(convB.id, convB.buyerWsId, user.id, atB);

    const rowsA = await repo.getForMany([conv.id], conv.buyerWsId, user.id);
    const rowsB = await repo.getForMany([convB.id], convB.buyerWsId, user.id);
    const rows = [...rowsA, ...rowsB];

    expect(rows).toHaveLength(2);
    const byConv = new Map(rows.map((r) => [r.conversationId, r]));
    expect(new Date(byConv.get(conv.id)!.lastReadAt).toISOString()).toBe(atA.toISOString());
    expect(new Date(byConv.get(convB.id)!.lastReadAt).toISOString()).toBe(atB.toISOString());
  });

  it('omits conversations with no read row rather than returning a placeholder', async () => {
    const { db, repo, conv, user } = await setup();
    const unread = await seedConversation(db);
    await repo.upsert(
      conv.id,
      conv.buyerWsId,
      user.id,
      new Date('2026-06-02T10:00:00.000Z'),
    );

    const rows = await repo.getForMany(
      [conv.id, unread.id],
      conv.buyerWsId,
      user.id,
    );

    expect(rows.map((r) => r.conversationId)).toEqual([conv.id]);
  });

  it("never leaks another user's read state", async () => {
    const { db, repo, conv, user } = await setup();
    const other = await seedUser(db);
    await repo.upsert(
      conv.id,
      conv.buyerWsId,
      other.id,
      new Date('2026-06-02T10:00:00.000Z'),
    );

    const rows = await repo.getForMany([conv.id], conv.buyerWsId, user.id);

    expect(rows).toEqual([]);
  });

  it('returns [] for an empty id list without querying', async () => {
    const { repo, conv, user } = await setup();
    await expect(repo.getForMany([], conv.buyerWsId, user.id)).resolves.toEqual([]);
  });
});

// Workspace-scoped read receipt. The workspace recorded at read time is the
// boundary; current memberships are not used to infer which side read.
describe('DrizzleChatReadRepository.maxLastReadAt', () => {
  it('returns the latest last_read_at from only the requested workspace', async () => {
    const { db, repo, conv } = await setup();
    const early = await seedUser(db);
    const late = await seedUser(db);
    const excluded = await seedUser(db);

    await repo.upsert(conv.id, conv.pgWsId, early.id, new Date('2026-06-02T10:00:00.000Z'));
    await repo.upsert(conv.id, conv.pgWsId, late.id, new Date('2026-06-02T12:00:00.000Z'));
    // Later than everyone, but recorded for the other side — must be ignored.
    await repo.upsert(conv.id, conv.buyerWsId, excluded.id, new Date('2026-06-02T23:00:00.000Z'));

    const at = await repo.maxLastReadAt(conv.id, conv.pgWsId);

    expect(at?.toISOString()).toBe(new Date('2026-06-02T12:00:00.000Z').toISOString());
  });

  it('does not count read state from a different conversation', async () => {
    const { db, repo, conv, user } = await setup();
    const otherConv = await seedConversation(db);
    await repo.upsert(
      otherConv.id,
      otherConv.buyerWsId,
      user.id,
      new Date('2026-06-02T10:00:00.000Z'),
    );

    const at = await repo.maxLastReadAt(conv.id, conv.buyerWsId);

    expect(at).toBeUndefined();
  });

  it('returns undefined when none of the users has read the conversation', async () => {
    const { repo, conv } = await setup();
    await expect(repo.maxLastReadAt(conv.id, conv.buyerWsId)).resolves.toBeUndefined();
  });
});
