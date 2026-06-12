// DrizzleChatConversationRepository + DrizzleChatMessageRepository contract —
// pglite-backed.
//
// chat_conversations is one row per buyer↔PG workspace pair:
//   unique(buyer_ws_id, pg_ws_id), last_message_at (inbox sort), created_at.
// chat_messages are the canonical (Postgres-only) message store:
//   index(conversation_id, created_at), author_ws_id derives the side.
//
// Contract under test (per impl-plan 2026-06-02, §리포지토리):
//   ChatConversationRepo:
//     - findOrCreatePair(buyerWsId, pgWsId, tx?): idempotent on the pair unique;
//       returns the same conversation id on repeat calls.
//     - findById(id, tx?): row or undefined.
//     - listForWorkspace(wsId, viewerType, tx?): conversations where the viewer's
//       side matches, sorted by last_message_at desc (nulls last).
//     - touchLastMessageAt(id, at, tx?): advances last_message_at.
//   ChatMessageRepo:
//     - save(msg, tx?): inserts a message.
//     - listByConversation(conversationId, tx?): created_at asc.
//   ChatReadRepo:
//     - lastReadByCounterparty(conversationId, viewerUserId, tx?): the max
//       last_read_at among users who are NOT the viewer (read-receipt source).

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleChatConversationRepository } from '../chat-conversation';
import { DrizzleChatMessageRepository } from '../chat-message';
import { DrizzleChatReadRepository } from '../chat-read';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const convRepo = new DrizzleChatConversationRepository(db);
  const msgRepo = new DrizzleChatMessageRepository(db);
  const readRepo = new DrizzleChatReadRepository(db);
  const buyer = await seedBuyerWorkspace(db);
  const pg = await seedPgWorkspace(db, 'PG');
  const author = await seedUser(db);
  return { db, convRepo, msgRepo, readRepo, buyer, pg, author };
}

describe('DrizzleChatConversationRepository.findOrCreatePair', () => {
  it('creates a conversation for a buyer↔PG pair', async () => {
    const { convRepo, buyer, pg } = await setup();
    const conv = await convRepo.findOrCreatePair(buyer.id, pg.id);
    expect(conv.id).toBeTruthy();
    expect(conv.buyerWsId).toBe(buyer.id);
    expect(conv.pgWsId).toBe(pg.id);
  });

  it('is idempotent — repeat calls return the same conversation id', async () => {
    const { convRepo, buyer, pg } = await setup();
    const first = await convRepo.findOrCreatePair(buyer.id, pg.id);
    const second = await convRepo.findOrCreatePair(buyer.id, pg.id);
    expect(second.id).toBe(first.id);
  });
});

describe('DrizzleChatConversationRepository.findById', () => {
  it('returns the conversation, or undefined when absent', async () => {
    const { convRepo, buyer, pg } = await setup();
    const conv = await convRepo.findOrCreatePair(buyer.id, pg.id);
    expect((await convRepo.findById(conv.id))!.id).toBe(conv.id);
    expect(await convRepo.findById(randomUUID())).toBeUndefined();
  });
});

describe('DrizzleChatConversationRepository.touchLastMessageAt + listForWorkspace', () => {
  it('lists the buyer side conversations sorted by last_message_at desc', async () => {
    const { db, convRepo } = await setup();
    const buyer = await seedBuyerWorkspace(db);
    const pgA = await seedPgWorkspace(db, 'PG-A');
    const pgB = await seedPgWorkspace(db, 'PG-B');
    const convA = await convRepo.findOrCreatePair(buyer.id, pgA.id);
    const convB = await convRepo.findOrCreatePair(buyer.id, pgB.id);

    await convRepo.touchLastMessageAt(convA.id, new Date('2026-06-02T10:00:00Z'));
    await convRepo.touchLastMessageAt(convB.id, new Date('2026-06-02T12:00:00Z'));

    const list = await convRepo.listForWorkspace(buyer.id, 'buyer');
    expect(list.map((c) => c.id)).toEqual([convB.id, convA.id]);
  });

  it('lists the pg side only for the pg viewer (does not leak the buyer side)', async () => {
    const { db, convRepo } = await setup();
    const buyer = await seedBuyerWorkspace(db);
    const pg = await seedPgWorkspace(db, 'PG-only');
    const conv = await convRepo.findOrCreatePair(buyer.id, pg.id);
    await convRepo.touchLastMessageAt(conv.id, new Date('2026-06-02T10:00:00Z'));

    const pgList = await convRepo.listForWorkspace(pg.id, 'pg');
    expect(pgList.map((c) => c.id)).toEqual([conv.id]);
    const otherBuyerList = await convRepo.listForWorkspace(buyer.id, 'pg');
    expect(otherBuyerList).toEqual([]);
  });
});

describe('DrizzleChatConversationRepository.findPair (읽기 전용)', () => {
  it('기존 페어 대화를 돌려준다', async () => {
    const { convRepo, buyer, pg } = await setup();
    const created = await convRepo.findOrCreatePair(buyer.id, pg.id);
    const found = await convRepo.findPair(buyer.id, pg.id);
    expect(found?.id).toBe(created.id);
  });

  it('페어가 없으면 undefined — 행을 생성하지 않는다 (sealed-bid 신호 누출 방지)', async () => {
    const { convRepo, buyer, pg } = await setup();
    expect(await convRepo.findPair(buyer.id, pg.id)).toBeUndefined();
    // 조회가 부수효과로 대화를 만들지 않았는지 — 같은 페어 재조회도 여전히 없음.
    expect(await convRepo.findPair(buyer.id, pg.id)).toBeUndefined();
    expect(await convRepo.listForWorkspace(pg.id, 'pg')).toEqual([]);
  });
});

describe('DrizzleChatMessageRepository', () => {
  it('saves messages and lists them by created_at ascending', async () => {
    const { convRepo, msgRepo, buyer, pg, author } = await setup();
    const conv = await convRepo.findOrCreatePair(buyer.id, pg.id);

    await msgRepo.save({
      id: randomUUID(),
      conversationId: conv.id,
      authorUserId: author.id,
      authorWsId: buyer.id,
      body: 'first',
      rfpId: null,
      createdAt: new Date('2026-06-02T10:00:00Z'),
    });
    await msgRepo.save({
      id: randomUUID(),
      conversationId: conv.id,
      authorUserId: author.id,
      authorWsId: buyer.id,
      body: 'second',
      rfpId: null,
      createdAt: new Date('2026-06-02T10:01:00Z'),
    });

    const rows = await msgRepo.listByConversation(conv.id);
    expect(rows.map((m) => m.body)).toEqual(['first', 'second']);
    expect(rows[0].authorWsId).toBe(buyer.id);
  });
});

describe('DrizzleChatReadRepository.lastReadByCounterparty', () => {
  it('returns the counterparty (not-viewer) last_read_at', async () => {
    const { db, convRepo, readRepo, buyer, pg } = await setup();
    const conv = await convRepo.findOrCreatePair(buyer.id, pg.id);
    const me = await seedUser(db);
    const them = await seedUser(db);

    await readRepo.upsert(conv.id, me.id, new Date('2026-06-02T09:00:00Z'));
    await readRepo.upsert(conv.id, them.id, new Date('2026-06-02T11:00:00Z'));

    const counterpartyAt = await readRepo.lastReadByCounterparty(conv.id, me.id);
    expect(counterpartyAt).toBeDefined();
    expect(new Date(counterpartyAt!).toISOString()).toBe(
      new Date('2026-06-02T11:00:00Z').toISOString(),
    );
  });

  it('returns undefined when only the viewer has read', async () => {
    const { db, convRepo, readRepo, buyer, pg } = await setup();
    const conv = await convRepo.findOrCreatePair(buyer.id, pg.id);
    const me = await seedUser(db);
    await readRepo.upsert(conv.id, me.id, new Date('2026-06-02T09:00:00Z'));
    expect(await readRepo.lastReadByCounterparty(conv.id, me.id)).toBeUndefined();
  });
});
