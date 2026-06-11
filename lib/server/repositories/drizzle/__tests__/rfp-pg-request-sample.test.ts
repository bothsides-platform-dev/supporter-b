import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest, getPgRequestRepo } from '@/lib/server/repositories/factory';
import { rfps } from '@/lib/db/schema';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('findOpenRfpsForPg excludes sample RFPs', () => {
  it('does not surface a sample RFP even if boardVisible=true', async () => {
    const u = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    const pg = await seedPgWorkspace(db, 'PG워크스페이스');
    await db.insert(rfps).values({
      id: randomUUID(),
      code: 'P-2606-SMPLBOARD',
      buyerWsId: buyer.id,
      title: 'sample on board',
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      status: 'sent',
      boardVisible: true, // 일부러 노출로 둬도
      isSample: true,
      createdBy: u.id,
    });
    const repo = await getPgRequestRepo();
    const open = await repo.findOpenRfpsForPg(pg.id, new Date());
    expect(open).toHaveLength(0); // 샘플은 제외돼야 함
  });
});
