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

  it('findPendingByPgWs returns only pending requests of the workspace', async () => {
    const repo = new DrizzleRfpRequoteRequestRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const otherPg = await seedPgWorkspace(db, 'other.io');
    // 명시 코드 — seedRfp 기본 랜덤 코드는 ~1/9000 확률로 unique 충돌 (CI 플레이크 방지).
    const rfpA = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0101' });
    const rfpB = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0102' });

    const pendingReq = makeReq(rfpA.id, pgWs.id, buyer.id);
    await repo.create(pendingReq);
    const respondedReq = makeReq(rfpB.id, pgWs.id, buyer.id);
    await repo.create(respondedReq);
    await repo.markResponded(respondedReq.id, new Date());
    await repo.create(makeReq(rfpA.id, otherPg.id, buyer.id)); // 다른 ws의 pending

    const rows = await repo.findPendingByPgWs(pgWs.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(pendingReq.id);
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
