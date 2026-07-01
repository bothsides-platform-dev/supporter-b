import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest, __useDrizzleWithDbForTest,
  getAttachmentRepo,
  getBidRepo, getBizProfileRepo, getContractRepo, getInvitationRepo,
  getPgRequestRepo, getRfpAllowedPgRepo, getRfpRepo, getWorkspaceRepo,
  getRfpRequoteRequestRepo,
  getAuditLogRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile, seedBuyerWorkspace, seedMembership, seedPgWorkspace, seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { auditLogs, bids, notifications, outboxEntries, rfpInvitations, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { RfpService } from '../rfp';

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
afterEach(() => __resetForTest());

async function seedBidderEnv() {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'pg.io');
  const pgAdmin = await seedUser(db, { email: 'admin@pg.io' });
  await seedMembership(db, pgWs.id, pgAdmin.id, 'admin');

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId, code: 'P-2606-0007', buyerWsId: buyerWs.id, bizProfileId: biz.id,
    title: 'requote test', memo: '', deadline: new Date(Date.now() + 86_400_000),
    status: 'sent', createdBy: buyer.id, sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
    sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 7), status: 'accepted',
  });
  await db.insert(bids).values({
    id: randomUUID(), rfpId, pgWsId: pgWs.id, invitationId: invId, round: 1,
    settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0', paymentFees: {},
    status: 'submitted', submittedBy: pgAdmin.id, submittedAt: new Date(),
  });
  return { buyer, buyerWs, pgWs, pgAdmin, rfpId };
}

const future = () => new Date(Date.now() + 3 * 86_400_000);

describe('RfpService.requote', () => {
  it('creates a pending requote(round 2), updates rfp.deadline, notifies PG admin', async () => {
    const s = await seedBidderEnv();
    const r = await service.requote(
      s.rfpId,
      { targetPgWsIds: [s.pgWs.id], message: '카드 수수료를 낮춰주세요', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(true);

    const reqs = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.round).toBe(2);
    expect(reqs[0]!.status).toBe('pending');

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(rfpRow!.deadline.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);

    const notifs = await db.select().from(notifications).where(eq(notifications.userId, s.pgAdmin.id));
    expect(notifs.some((n) => n.type === 'rfp.requote_requested')).toBe(true);

    const emails = await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'rfp.requote_requested'));
    expect(emails.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a target PG with no submitted bid', async () => {
    const s = await seedBidderEnv();
    const otherPg = await seedPgWorkspace(db, 'no-bid.io');
    const r = await service.requote(
      s.rfpId,
      { targetPgWsIds: [otherPg.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TARGET_NOT_BIDDER');
  });

  it('rejects when rfp is not sent', async () => {
    const s = await seedBidderEnv();
    await db.update(rfps).set({ status: 'awarded' }).where(eq(rfps.id, s.rfpId));
    const r = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('RFP_NOT_OPEN');
  });

  it('rejects a past deadline and an empty target list', async () => {
    const s = await seedBidderEnv();
    const past = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: new Date(Date.now() - 1000) },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(past.ok).toBe(false);
    const empty = await service.requote(
      s.rfpId, { targetPgWsIds: [], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(empty.ok).toBe(false);
  });

  it('rejects a duplicate pending requote for the same pair', async () => {
    const s = await seedBidderEnv();
    const ok = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(ok.ok).toBe(true);
    const dup = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe('REQUOTE_ALREADY_PENDING');
  });

  it('forbids a non-owner buyer', async () => {
    const s = await seedBidderEnv();
    const r = await service.requote(
      s.rfpId, { targetPgWsIds: [s.pgWs.id], message: 'x', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: randomUUID() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_BUYER');
  });

  it('writes nothing when one of multiple targets is invalid (all-or-nothing)', async () => {
    const s = await seedBidderEnv();
    const nonBidder = await seedPgWorkspace(db, 'no-bid.io'); // has NO submitted bid
    const [rfpBefore] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));

    const r = await service.requote(
      s.rfpId,
      { targetPgWsIds: [s.pgWs.id, nonBidder.id], message: '낮춰주세요', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TARGET_NOT_BIDDER');

    // all-or-nothing: the valid target (s.pgWs) must NOT have a requote row, and the deadline must be unchanged
    const reqs = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(reqs).toHaveLength(0);
    const [rfpAfter] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(rfpAfter!.deadline.getTime()).toBe(rfpBefore!.deadline.getTime());
  });
});

// ─── 감사 로그 (C5) ───────────────────────────────────────────────────────────

describe('RfpService.requote — 감사 로그 기록', () => {
  it('requote 성공 시 rfp.requote 감사 행을 남긴다', async () => {
    const s = await seedBidderEnv();
    const r = await service.requote(
      s.rfpId,
      { targetPgWsIds: [s.pgWs.id], message: '조건 개선 부탁해요', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(true);

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'rfp.requote'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: s.buyer.id,
      actorWorkspaceId: s.buyerWs.id,
      entityType: 'rfp',
    });
    expect(rows[0]!.metadata).toMatchObject({ targetPgWsIds: [s.pgWs.id] });
  });
});
