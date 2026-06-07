import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getBidRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { bids, rfpInvitations } from '@/lib/db/schema';
import { BidService } from '../bid';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: BidService;

async function buildService(): Promise<BidService> {
  const [bidRepo, invRepo] = await Promise.all([getBidRepo(), getInvitationRepo()]);
  return new BidService(db, bidRepo, invRepo);
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});

afterEach(() => {
  __resetForTest();
});

// ─── seed helpers ────────────────────────────────────────────────────────────

type WithdrawSetup = {
  pgUserId: string;
  pgWsId: string;
  rfpId: string;
  invitationId: string;
  bidId: string;
};

async function seedWithdrawEnv(): Promise<WithdrawSetup> {
  const buyer = await seedUser(db, { email: 'buyer@withdraw.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@withdraw.com' });
  const pgWs = await seedPgWorkspace(db, 'pg.withdraw');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, {
    buyerWsId: buyerWs.id,
    createdBy: buyer.id,
    code: 'P-2606-0010',
  });
  // Set status to 'sent' so invitation is active
  await db
    .update((await import('@/lib/db/schema')).rfps)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq((await import('@/lib/db/schema')).rfps.id, rfp.id));

  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
  });

  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    status: 'submitted',
    submittedBy: pgUser.id,
    submittedAt: new Date(),
  });

  return {
    pgUserId: pgUser.id,
    pgWsId: pgWs.id,
    rfpId: rfp.id,
    invitationId: invId,
    bidId,
  };
}

// ─── BidService.withdraw ─────────────────────────────────────────────────────

describe('BidService.withdraw', () => {
  it('returns BID_NOT_FOUND when bid does not exist', async () => {
    const r = await service.withdraw(randomUUID(), {
      userId: randomUUID(),
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('BID_NOT_FOUND');
  });

  it('returns FORBIDDEN when actor workspace does not own the bid', async () => {
    const s = await seedWithdrawEnv();
    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });

  it('sets bid status to withdrawn', async () => {
    const s = await seedWithdrawEnv();
    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(true);

    const [row] = await db
      .select({ status: bids.status })
      .from(bids)
      .where(eq(bids.id, s.bidId));
    expect(row!.status).toBe('withdrawn');
  });

  it('is idempotent — already withdrawn bid returns ok', async () => {
    const s = await seedWithdrawEnv();
    await db.update(bids).set({ status: 'withdrawn' }).where(eq(bids.id, s.bidId));

    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(true);
  });

  it('returns FORBIDDEN when invitation is expired (canAccess false)', async () => {
    const s = await seedWithdrawEnv();
    // Expire the invitation so canAccess returns false.
    await db
      .update(rfpInvitations)
      .set({ status: 'expired' })
      .where(eq(rfpInvitations.id, s.invitationId));

    // pgWsId matches bid.pgWsId (passes first guard), but canAccess fails.
    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });
});
