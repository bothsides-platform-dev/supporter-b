import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAttachmentRepo,
  getBidRepo,
  getBizProfileRepo,
  getContractRepo,
  getInvitationRepo,
  getPgRequestRepo,
  getRfpAllowedPgRepo,
  getRfpRepo,
  getRfpRequoteRequestRepo,
  getAuditLogRepo,
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
  auditLogs,
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
  const [rfpRepo, contractRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo, requoteRepo, auditRepo, allowedPgRepo, attRepo] =
    await Promise.all([
      getRfpRepo(), getContractRepo(), getWorkspaceRepo(), getBidRepo(),
      getInvitationRepo(), getPgRequestRepo(), getBizProfileRepo(), getRfpRequoteRequestRepo(), getAuditLogRepo(),
      getRfpAllowedPgRepo(), getAttachmentRepo(),
    ]);
  return new RfpService(db, rfpRepo, contractRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo, requoteRepo, auditRepo, allowedPgRepo, attRepo);
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

  it('requote 후 동일 PG 선정 시 rfp.awarded만 발송되고 rfp.rejected는 발송되지 않는다', async () => {
    // Setup: buyer + two PG workspaces
    const buyer = await seedUser(db, { email: 'buyer@requote-award.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');

    const winnerWs = await seedPgWorkspace(db, 'winner.requote');
    const w1 = await seedUser(db, { email: 'w1@winner.requote' });
    await seedMembership(db, winnerWs.id, w1.id, 'admin');

    const loserWs = await seedPgWorkspace(db, 'loser.requote');
    const l1 = await seedUser(db, { email: 'l1@loser.requote' });
    await seedMembership(db, loserWs.id, l1.id, 'admin');

    const rfpId = randomUUID();
    const rfpCode = 'P-2606-9001';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'requote award test',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });

    // PG-A invitation (shared across both rounds)
    const winnerInvId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: winnerInvId,
      rfpId,
      pgWsId: winnerWs.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });

    // PG-A round-1 bid (submitted, NOT the awarded bid)
    await db.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId: winnerWs.id,
      invitationId: winnerInvId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: w1.id,
      submittedAt: new Date(),
      round: 1,
    });

    // PG-A round-2 bid (submitted, this is the awarded bid)
    const round2BidId = randomUUID();
    await db.insert(bids).values({
      id: round2BidId,
      rfpId,
      pgWsId: winnerWs.id,
      invitationId: winnerInvId,
      settleCycle: 'D+2',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: w1.id,
      submittedAt: new Date(),
      round: 2,
    });

    // PG-B round-1 bid
    const loserInvId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: loserInvId,
      rfpId,
      pgWsId: loserWs.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });
    await db.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId: loserWs.id,
      invitationId: loserInvId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: l1.id,
      submittedAt: new Date(),
      round: 1,
    });

    // Award PG-A's round-2 bid
    const r = await service.award(rfpId, round2BidId, {
      userId: buyer.id,
      workspaceId: buyerWs.id,
    });
    expect(r.ok).toBe(true);

    // PG-A: rfp.awarded 1건, rfp.rejected 0건
    const winnerNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, winnerWs.id));
    const winnerAwarded = winnerNotifs.filter((n) => n.type === 'rfp.awarded');
    const winnerRejected = winnerNotifs.filter((n) => n.type === 'rfp.rejected');
    expect(winnerAwarded).toHaveLength(1);
    expect(winnerRejected).toHaveLength(0);

    // PG-B: rfp.rejected 1건
    const loserNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, loserWs.id));
    expect(loserNotifs).toHaveLength(1);
    expect(loserNotifs[0]!.type).toBe('rfp.rejected');
  });

  it('requote 후 탈락 PG에도 rfp.rejected가 1건만 발송된다 (loser multi-round dedup)', async () => {
    // PG-A: round-1 + round-2 submitted (winner, awarded round-2)
    // PG-B: round-1 + round-2 submitted (loser — both rounds are 'submitted')
    // Expected: PG-B gets exactly 1 rfp.rejected (not 2)
    const buyer = await seedUser(db, { email: 'buyer@loser-dedup.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');

    const winnerWs = await seedPgWorkspace(db, 'winner.loserdedup');
    const w1 = await seedUser(db, { email: 'w1@winner.loserdedup' });
    await seedMembership(db, winnerWs.id, w1.id, 'admin');

    const loserWs = await seedPgWorkspace(db, 'loser.loserdedup');
    const l1 = await seedUser(db, { email: 'l1@loser.loserdedup' });
    await seedMembership(db, loserWs.id, l1.id, 'admin');

    const rfpId = randomUUID();
    const rfpCode = 'P-2606-9002';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'loser dedup test',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });

    // PG-A invitation + round-1 + round-2
    const winnerInvId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: winnerInvId,
      rfpId,
      pgWsId: winnerWs.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });
    await db.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId: winnerWs.id,
      invitationId: winnerInvId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: w1.id,
      submittedAt: new Date(),
      round: 1,
    });
    const winnerBidId = randomUUID();
    await db.insert(bids).values({
      id: winnerBidId,
      rfpId,
      pgWsId: winnerWs.id,
      invitationId: winnerInvId,
      settleCycle: 'D+2',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: w1.id,
      submittedAt: new Date(),
      round: 2,
    });

    // PG-B invitation + round-1 + round-2 (both submitted — loser that also had a requote)
    const loserInvId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: loserInvId,
      rfpId,
      pgWsId: loserWs.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });
    await db.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId: loserWs.id,
      invitationId: loserInvId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: l1.id,
      submittedAt: new Date(),
      round: 1,
    });
    await db.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId: loserWs.id,
      invitationId: loserInvId,
      settleCycle: 'D+2',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: l1.id,
      submittedAt: new Date(),
      round: 2,
    });

    const r = await service.award(rfpId, winnerBidId, {
      userId: buyer.id,
      workspaceId: buyerWs.id,
    });
    expect(r.ok).toBe(true);

    // PG-B: rfp.rejected exactly 1건 (not 2, even though they have 2 submitted rounds)
    const loserNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, loserWs.id));
    const loserRejected = loserNotifs.filter((n) => n.type === 'rfp.rejected');
    expect(loserRejected).toHaveLength(1);
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

// ─── 감사 로그 (C5) ───────────────────────────────────────────────────────────
// 각 상태 전이는 해당 트랜잭션 안에서 audit_logs 에 "누가 무엇을" 을 남긴다.

describe('RfpService — 감사 로그 기록', () => {
  async function rowsFor(action: string) {
    return db.select().from(auditLogs).where(eq(auditLogs.action, action));
  }

  it('award 성공 시 rfp.award 감사 행을 남긴다', async () => {
    const s = await seedAwardEnv();
    const r = await service.award(s.rfpId, s.winnerBidId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const rows = await rowsFor('rfp.award');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: s.buyerUserId,
      actorWorkspaceId: s.buyerWsId,
      entityType: 'rfp',
      entityId: s.rfpCode,
    });
    expect(rows[0]!.metadata).toMatchObject({ bidId: s.winnerBidId });
  });

  it('실패한 award(FORBIDDEN_BUYER)는 감사 행을 남기지 않는다', async () => {
    const s = await seedAwardEnv();
    await service.award(s.rfpId, s.winnerBidId, {
      userId: s.buyerUserId,
      workspaceId: randomUUID(),
    });
    expect(await rowsFor('rfp.award')).toHaveLength(0);
  });

  it('cancel 성공 시 rfp.cancel 감사 행을 남긴다', async () => {
    const s = await seedCancelEnv();
    const r = await service.cancel(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const rows = await rowsFor('rfp.cancel');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: s.buyerUserId,
      actorWorkspaceId: s.buyerWsId,
      entityType: 'rfp',
    });
  });

  it('close 성공 시 rfp.close 감사 행을 남긴다', async () => {
    const s = await seedCancelEnv();
    const r = await service.close(s.rfpId, {
      userId: s.buyerUserId,
      workspaceId: s.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const rows = await rowsFor('rfp.close');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: s.buyerUserId,
      actorWorkspaceId: s.buyerWsId,
      entityType: 'rfp',
    });
  });
});
