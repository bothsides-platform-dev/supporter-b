// DrizzleRfpTeamMessageRepository contract — pglite-backed.
//
// rfp_team_messages is the RFP-scoped internal team thread (v1: no mentions,
// no notifications, no read-state, no attachments). Scope key = (rfp_id,
// workspace_id): the buyer team and each PG team get fully separate threads on
// the same RFP — cross-workspace leakage would break the sealed-bid invariant.
//
// Contract under test:
//   RfpTeamMessageRepo:
//     - save(msg, tx?): inserts a message.
//     - listByScope(rfpId, workspaceId, tx?): created_at asc, authorName
//       hydrated from users, rows of OTHER workspaces never returned.

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleRfpTeamMessageRepository } from '../rfp-team-message';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleRfpTeamMessageRepository(db);
  const buyer = await seedBuyerWorkspace(db);
  const author = await seedUser(db, { name: '김구매' });
  const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: author.id });
  return { db, repo, buyer, author, rfp };
}

describe('DrizzleRfpTeamMessageRepository', () => {
  it('saves messages and lists them by created_at ascending with authorName', async () => {
    const { repo, buyer, author, rfp } = await setup();

    await repo.save({
      id: randomUUID(),
      rfpId: rfp.id,
      workspaceId: buyer.id,
      authorUserId: author.id,
      body: 'first',
      createdAt: new Date('2026-06-10T10:00:00Z'),
    });
    await repo.save({
      id: randomUUID(),
      rfpId: rfp.id,
      workspaceId: buyer.id,
      authorUserId: author.id,
      body: 'second',
      createdAt: new Date('2026-06-10T10:01:00Z'),
    });

    const rows = await repo.listByScope(rfp.id, buyer.id);
    expect(rows.map((m) => m.body)).toEqual(['first', 'second']);
    expect(rows[0].authorName).toBe('김구매');
    expect(rows[0].workspaceId).toBe(buyer.id);
  });

  it('isolates scopes — same rfp, different workspace threads never mix', async () => {
    const { db, repo, buyer, author, rfp } = await setup();
    const pg = await seedPgWorkspace(db, 'PG-A');
    const pgUser = await seedUser(db, { name: '박피지' });

    await repo.save({
      id: randomUUID(),
      rfpId: rfp.id,
      workspaceId: buyer.id,
      authorUserId: author.id,
      body: 'buyer internal memo',
      createdAt: new Date('2026-06-10T10:00:00Z'),
    });
    await repo.save({
      id: randomUUID(),
      rfpId: rfp.id,
      workspaceId: pg.id,
      authorUserId: pgUser.id,
      body: 'pg internal memo',
      createdAt: new Date('2026-06-10T10:00:30Z'),
    });

    const buyerRows = await repo.listByScope(rfp.id, buyer.id);
    expect(buyerRows.map((m) => m.body)).toEqual(['buyer internal memo']);

    const pgRows = await repo.listByScope(rfp.id, pg.id);
    expect(pgRows.map((m) => m.body)).toEqual(['pg internal memo']);
    expect(pgRows[0].authorName).toBe('박피지');
  });

  it('returns an empty list for a scope with no messages', async () => {
    const { repo, rfp } = await setup();
    expect(await repo.listByScope(rfp.id, randomUUID())).toEqual([]);
  });

  it('listThreadsForWorkspace aggregates one summary per rfp with its last message', async () => {
    const db = await createPgliteDb();
    const u = await seedUser(db, { email: 'u@b.com', name: 'U' });
    const ws = await seedBuyerWorkspace(db);
    const rfpA = await seedRfp(db, { buyerWsId: ws.id, createdBy: u.id });
    const rfpB = await seedRfp(db, { buyerWsId: ws.id, createdBy: u.id });
    const repo = new DrizzleRfpTeamMessageRepository(db);
    await repo.save({ id: randomUUID(), rfpId: rfpA.id, workspaceId: ws.id, authorUserId: u.id, body: 'A1', createdAt: new Date('2026-06-14T00:00:00Z') });
    await repo.save({ id: randomUUID(), rfpId: rfpA.id, workspaceId: ws.id, authorUserId: u.id, body: 'A2-last', createdAt: new Date('2026-06-14T02:00:00Z') });
    await repo.save({ id: randomUUID(), rfpId: rfpB.id, workspaceId: ws.id, authorUserId: u.id, body: 'B1-last', createdAt: new Date('2026-06-14T01:00:00Z') });

    const summaries = await repo.listThreadsForWorkspace(ws.id);
    expect(summaries).toHaveLength(2);
    const a = summaries.find((s) => s.rfpId === rfpA.id)!;
    expect(a.lastBody).toBe('A2-last');
    expect(a.lastMessageAt.toISOString()).toBe('2026-06-14T02:00:00.000Z');
    const otherWs = await seedBuyerWorkspace(db);
    expect(await repo.listThreadsForWorkspace(otherWs.id)).toHaveLength(0);
  });

  // Lightweight owner lookup for the attachment ACL — returns the message's
  // scoping workspace so the sealed-bid gate (viewer ws === message ws) can be
  // enforced without exposing body/author. id → { workspaceId }.
  it('findOwner returns the scoping workspaceId for a known message', async () => {
    const { repo, buyer, author, rfp } = await setup();
    const msgId = randomUUID();
    await repo.save({
      id: msgId,
      rfpId: rfp.id,
      workspaceId: buyer.id,
      authorUserId: author.id,
      body: 'scoped',
      createdAt: new Date('2026-06-10T10:00:00Z'),
    });
    expect(await repo.findOwner(msgId)).toEqual({ workspaceId: buyer.id });
  });

  it('findOwner returns undefined for an unknown message', async () => {
    const { repo } = await setup();
    expect(await repo.findOwner(randomUUID())).toBeUndefined();
  });
});
