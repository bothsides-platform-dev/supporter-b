import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { seedBuyerWorkspace, seedRfp, seedUser } from './_seed';
import { DrizzleDeadlineNotificationRepository } from '../deadline-notification';
import { rfps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });

describe('deadline notification delivery repository', () => {
  it('claims a recipient and deadline exactly once', async () => {
    const user = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
    const repo = new DrizzleDeadlineNotificationRepository(db);
    const record = {
      key: `closed:${rfp.id}:${user.id}`, rfpId: rfp.id, recipientUserId: user.id,
      kind: 'closed', deadline: new Date('2026-10-01T09:00:00Z'),
      pgWsId: null, reviewId: null, round: null,
    };
    expect(await repo.claim(record)).toBe(true);
    expect(await repo.claim(record)).toBe(false);
  });

  it('lists sent requests for cron processing', async () => {
    const user = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
    await db.update(rfps).set({ status: 'sent' }).where(eq(rfps.id, rfp.id));
    const second = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
    await db.update(rfps).set({ status: 'sent' }).where(eq(rfps.id, second.id));
    const repo = new DrizzleDeadlineNotificationRepository(db);
    expect(await repo.sentRfpIds()).toContain(rfp.id);
    const firstPage = await repo.sentRfpIds(undefined, 1);
    const secondPage = await repo.sentRfpIds(firstPage[0], 1);
    expect([...firstPage, ...secondPage].sort()).toEqual([rfp.id, second.id].sort());
  });
});
