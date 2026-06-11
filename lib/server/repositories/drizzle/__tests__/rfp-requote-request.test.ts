import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { seedUser, seedBuyerWorkspace, seedPgWorkspace, seedRfp } from './_seed';
import { DrizzleRfpRequoteRequestRepository } from '../rfp-requote-request';
import type { RfpRequoteRequest } from '@/lib/types/rfp-requote-request';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

function makeReq(rfpId: string, pgWsId: string, userId: string, round = 2): RfpRequoteRequest {
  return {
    id: randomUUID(),
    rfpId,
    pgWsId,
    round,
    message: '카드 수수료를 조금 더 낮춰주세요',
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'pending',
    createdByUserId: userId,
    createdAt: new Date().toISOString(),
  };
}

describe('DrizzleRfpRequoteRequestRepository', () => {
  it('create → findPendingByPair returns it; markResponded clears pending', async () => {
    const repo = new DrizzleRfpRequoteRequestRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });

    const req = makeReq(rfpId, pgWs.id, buyer.id);
    await repo.create(req);

    const pending = await repo.findPendingByPair(rfpId, pgWs.id);
    expect(pending?.id).toBe(req.id);
    expect(pending?.round).toBe(2);

    await repo.markResponded(req.id, new Date());
    expect(await repo.findPendingByPair(rfpId, pgWs.id)).toBeUndefined();

    const all = await repo.findByRfp(rfpId);
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('responded');
  });

  it('duplicate (rfp,pg,round) throws', async () => {
    const repo = new DrizzleRfpRequoteRequestRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    await repo.create(makeReq(rfpId, pgWs.id, buyer.id, 2));
    await expect(repo.create(makeReq(rfpId, pgWs.id, buyer.id, 2))).rejects.toBeDefined();
  });
});
