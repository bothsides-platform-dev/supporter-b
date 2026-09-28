import { afterEach, expect, it, vi } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { seedBuyerWorkspace, seedRfp, seedUser } from './_seed';

afterEach(() => vi.restoreAllMocks());

it('creates distinct default RFP codes even when random values repeat', async () => {
  const db = await createPgliteDb();
  const user = await seedUser(db);
  const buyer = await seedBuyerWorkspace(db);
  vi.spyOn(Math, 'random').mockReturnValue(0);

  const first = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
  const second = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });

  expect(second.code).not.toBe(first.code);
});
