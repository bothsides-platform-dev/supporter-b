import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getBidRepo,
  getBizProfileRepo,
  getContractRepo,
  getInvitationRepo,
  getOutboxRepo,
  getPgRequestRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  bids,
  contracts,
  notifications,
  outboxEntries,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import { RfpService } from '../rfp';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: RfpService;

async function buildService(): Promise<RfpService> {
  const [rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo] =
    await Promise.all([
      getRfpRepo(), getContractRepo(), getOutboxRepo(), getWorkspaceRepo(), getBidRepo(),
      getInvitationRepo(), getPgRequestRepo(), getBizProfileRepo(),
    ]);
  return new RfpService(db, rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo);
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

type AwardSetup = {
  buyerUserId: string;
  buyerWsId: string;
  rfpId: string;
  rfpCode: string;
  winnerWsId: string;
  winnerUserIds: string[];
  loserWsId: string;
  loserUserIds: string[];
  winnerBidId: string;
  loserBidId: string;
};

async function seedAwardEnv(): Promise<AwardSetup> {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const winnerWs = await seedPgWorkspace(db, 'winner.pg');
  const w1 = await seedUser(db, { email: 'w1@winner.pg' });
  const w2 = await seedUser(db, { email: 'w2@winner.pg' });
  await seedMembership(db, winnerWs.id, w1.id, 'admin');
  await seedMembership(db, winnerWs.id, w2.id, 'member');

  const loserWs = await seedPgWorkspace(db, 'loser.pg');
  const l1 = await seedUser(db, { email: 'l1@loser.pg' });
  await seedMembership(db, loserWs.id, l1.id, 'admin');

  const rfpId = randomUUID();
  const rfpCode = 'P-2606-0001';
  await db.insert(rfps).values({
    id: rfpId,
    code: rfpCode,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'award service test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });

  async function seedBid(pgWsId: string, creatorId: string): Promise<string> {
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId,
      rfpId,
      pgWsId,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });
    const bidId = randomUUID();
    await db.insert(bids).values({
      id: bidId,
      rfpId,
      pgWsId,
      invitationId: invId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: creatorId,
      submittedAt: new Date(),
    });
    return bidId;
  }

  const winnerBidId = await seedBid(winnerWs.id, w1.id);
  const loserBidId = await seedBid(loserWs.id, l1.id);

  return {
    buyerUserId: buyer.id,
    buyerWsId: buyerWs.id,
    rfpId,
    rfpCode,
    winnerWsId: winnerWs.id,
    winnerUserIds: [w1.id, w2.id],
    loserWsId: loserWs.id,
    loserUserIds: [l1.id],
    winnerBidId,
    loserBidId,
  };
}

type CancelSetup = {
  buyerUserId: string;
  buyerWsId: string;
  rfpId: string;
  pgWsId: string;
  pgUserIds: string[];
};

async function seedCancelEnv(): Promise<CancelSetup> {
  const buyer = await seedUser(db, { email: 'buyer@cancel.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgWs = await seedPgWorkspace(db, 'pg.cancel');
  const p1 = await seedUser(db, { email: 'p1@pg.cancel' });
  const p2 = await seedUser(db, { email: 'p2@pg.cancel' });
  await seedMembership(db, pgWs.id, p1.id, 'admin');
  await seedMembership(db, pgWs.id, p2.id, 'member');

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2606-0002',
    buyerWsId: buyerWs.id,
    title: 'cancel service test',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });

  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
  });
  await db.insert(bids).values({
    id: randomUUID(),
    rfpId,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    status: 'submitted',
    submittedBy: p1.id,
    submittedAt: new Date(),
  });

  return {
    buyerUserId: buyer.id,
    buyerWsId: buyerWs.id,
    rfpId,
    pgWsId: pgWs.id,
    pgUserIds: [p1.id, p2.id],
  };
}

// ─── RfpService.award ────────────────────────────────────────────────────────

describe('RfpService.award', () => {
  it('returns RFP_NOT_FOUND when rfp does not exist', async () => {
    const r = await service.award(randomUUID(), randomUUID(), {
      userId: randomUUID(),
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('RFP_NOT_FOUND');
  });

  it('returns FORBIDDEN_BUYER when actor workspace does not own the rfp', async () => {
    const s = await seedAwardEnv();
    const r = await service.award(s.rfpId, s.winnerBidId, {
      userId: s.buyerUserId,
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN_BUYER');
  });

  it('transitions rfp to awarded, writes contract, sets awardedBidId', async () => {
    const s = await seedAwardEnv();
    const r = await service.award(s.rfpId, s.winnerBidId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(rfpRow!.status).toBe('awarded');
    expect(rfpRow!.awardedBidId).toBe(s.winnerBidId);

    const [c] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.rfpId, s.rfpId));
    expect(c).toBeDefined();
    expect(c!.bidId).toBe(s.winnerBidId);
    expect(c!.awardedBy).toBe(s.buyerUserId);
  });

  it('winner gets in-app + outbox emails; loser gets in-app only (no outbox)', async () => {
    const s = await seedAwardEnv();
    await service.award(s.rfpId, s.winnerBidId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });

    const winnerNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, s.winnerWsId));
    expect(winnerNotifs).toHaveLength(s.winnerUserIds.length);
    expect(winnerNotifs[0]!.type).toBe('rfp.awarded');

    const winnerEmails = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.awarded'));
    expect(winnerEmails.length).toBeGreaterThanOrEqual(s.winnerUserIds.length);

    const loserNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, s.loserWsId));
    expect(loserNotifs).toHaveLength(s.loserUserIds.length);
    expect(loserNotifs[0]!.type).toBe('rfp.rejected');

    // loser outbox: no emails sent — only in-app
    const allOutbox = await db.select().from(outboxEntries);
    expect(allOutbox.every((e) => e.event === 'rfp.awarded')).toBe(true);
  });

  it('returns WINNING_BID_NOT_FOUND when awardedBidId does not exist', async () => {
    const s = await seedAwardEnv();
    const r = await service.award(s.rfpId, randomUUID(), {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('WINNING_BID_NOT_FOUND');
  });

  it('refuses to award a sample RFP (SAMPLE_READONLY)', async () => {
    const s = await seedAwardEnv();
    await db.update(rfps).set({ isSample: true }).where(eq(rfps.id, s.rfpId));
    const r = await service.award(s.rfpId, s.winnerBidId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r).toEqual({ ok: false, error: 'SAMPLE_READONLY' });
    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(rfpRow!.status).not.toBe('awarded');
    const c = await db.select().from(contracts).where(eq(contracts.rfpId, s.rfpId));
    expect(c).toHaveLength(0);
  });
});

// ─── RfpService.cancel ───────────────────────────────────────────────────────

describe('RfpService.cancel', () => {
  it('returns RFP_NOT_FOUND when rfp does not exist', async () => {
    const r = await service.cancel(randomUUID(), {
      userId: randomUUID(),
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('RFP_NOT_FOUND');
  });

  it('returns FORBIDDEN_BUYER for wrong workspace', async () => {
    const s = await seedCancelEnv();
    const r = await service.cancel(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN_BUYER');
  });

  it('transitions to cancelled + dispatches rfp.cancelled to all bidder ws members', async () => {
    const s = await seedCancelEnv();
    const r = await service.cancel(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const [row] = await db
      .select({ status: rfps.status })
      .from(rfps)
      .where(eq(rfps.id, s.rfpId));
    expect(row!.status).toBe('cancelled');

    const pgNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, s.pgWsId));
    expect(pgNotifs).toHaveLength(s.pgUserIds.length);
    expect(pgNotifs[0]!.type).toBe('rfp.cancelled');
  });
});

// ─── RfpService.close ────────────────────────────────────────────────────────

describe('RfpService.close', () => {
  it('transitions to closed + dispatches rfp.closed to bidder ws members', async () => {
    const s = await seedCancelEnv();
    const r = await service.close(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const [row] = await db
      .select({ status: rfps.status })
      .from(rfps)
      .where(eq(rfps.id, s.rfpId));
    expect(row!.status).toBe('closed');

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, s.pgWsId));
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0]!.type).toBe('rfp.closed');
  });

  it('returns FORBIDDEN_BUYER for wrong workspace', async () => {
    const s = await seedCancelEnv();
    const r = await service.close(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN_BUYER');
  });

  it('returns RFP_NOT_FOUND when rfp does not exist', async () => {
    const r = await service.close(randomUUID(), {
      userId: randomUUID(),
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('RFP_NOT_FOUND');
  });

  it('returns INVALID_TRANSITION error when rfp is already closed', async () => {
    const s = await seedCancelEnv();
    // pre-close
    await db
      .update(rfps)
      .set({ status: 'closed' })
      .where(eq(rfps.id, s.rfpId));

    const r = await service.close(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/INVALID_TRANSITION/);
  });

  it('succeeds with no in-app notifications when rfp has no submitted bids', async () => {
    // RFP without any bids — close should still transition OK, emit no notifications.
    const buyer = await seedUser(db, { email: 'buyer@nobids.com' });
    const buyerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');

    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2606-0099',
      buyerWsId: buyerWs.id,
      title: 'no bids test',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });

    const r = await service.close(rfpId, {
      userId: buyer.id,
      workspaceId: buyerWs.id,
    });
    expect(r.ok).toBe(true);

    const notifs = await db.select().from(notifications);
    expect(notifs).toHaveLength(0);
  });
});

// ─── RfpService.award — INVALID_TRANSITION ──────────────────────────────────

describe('RfpService.award — INVALID_TRANSITION', () => {
  it('returns INVALID_TRANSITION error when rfp is already awarded', async () => {
    const s = await seedAwardEnv();
    await db
      .update(rfps)
      .set({ status: 'awarded' })
      .where(eq(rfps.id, s.rfpId));

    const r = await service.award(s.rfpId, s.winnerBidId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/INVALID_TRANSITION/);
  });
});

// ─── RfpService.cancel — INVALID_TRANSITION ──────────────────────────────────

describe('RfpService.cancel — INVALID_TRANSITION', () => {
  it('returns INVALID_TRANSITION error when rfp is already cancelled', async () => {
    const s = await seedCancelEnv();
    // pre-cancel
    await db
      .update(rfps)
      .set({ status: 'cancelled' })
      .where(eq(rfps.id, s.rfpId));

    const r = await service.cancel(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/INVALID_TRANSITION/);
  });
});
