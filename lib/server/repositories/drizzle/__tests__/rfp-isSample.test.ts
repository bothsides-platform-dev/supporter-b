import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest, getRfpRepo } from '@/lib/server/repositories/factory';
import { rfps } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('rowToRfp isSample mapping', () => {
  it('maps rfps.is_sample → RFP.isSample', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const code = `P-2606-${Math.floor(1000 + Math.random() * 8999)}`;
    await db.insert(rfps).values({
      id: randomUUID(),
      code,
      buyerWsId: ws.id,
      title: 'sample',
      deadline: new Date(Date.now() + 1000),
      createdBy: u.id,
      isSample: true,
    });
    const repo = await getRfpRepo();
    const found = await repo.findByCode(code);
    expect(found?.isSample).toBe(true);
  });
});
