import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { seedBuyerWorkspace, seedRfp, seedUser } from './_seed';
import { DrizzleDeadlineNotificationRepository } from '../deadline-notification';
import { rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { seedPgWorkspace } from './_seed';
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
    const since = new Date(0);
    expect(await repo.sentRfpIds(since)).toContain(rfp.id);
    const firstPage = await repo.sentRfpIds(since, undefined, 1);
    const secondPage = await repo.sentRfpIds(since, firstPage[0], 1);
    expect([...firstPage, ...secondPage].sort()).toEqual([rfp.id, second.id].sort());
  });

  it('lists only sent requests whose effective deadline is after the cutoff', async () => {
    const user = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    const pg = await seedPgWorkspace(db, 'PG');
    const cutoff = new Date('2026-10-01T00:00:00Z');
    const before = new Date('2026-09-01T09:00:00Z');
    const after = new Date('2026-10-02T09:00:00Z');
    const seed = async (deadline: Date, status: 'sent' | 'closed' = 'sent') => {
      const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
      await db.update(rfps).set({ status, deadline }).where(eq(rfps.id, rfp.id));
      return rfp.id;
    };
    const open = await seed(after);
    const stale = await seed(before);
    const reopenedByRequote = await seed(before);
    const respondedRequote = await seed(before);
    await seed(after, 'closed');
    await db.insert(rfpRequoteRequests).values([
      { rfpId: reopenedByRequote, pgWsId: pg.id, round: 2, message: 'm', deadline: after, status: 'pending', createdByUserId: user.id },
      { rfpId: respondedRequote, pgWsId: pg.id, round: 2, message: 'm', deadline: after, status: 'responded', createdByUserId: user.id, respondedAt: before },
    ]);
    const ids = await new DrizzleDeadlineNotificationRepository(db).sentRfpIds(cutoff);
    expect(ids.sort()).toEqual([open, reopenedByRequote].sort());
    expect(ids).not.toContain(stale);
    expect(ids).not.toContain(respondedRequote);
  });
});
