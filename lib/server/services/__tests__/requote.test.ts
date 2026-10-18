import { getPgMatchingRepo } from '@/lib/server/repositories/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBusinessCalendar, validBusinessDeadline } from '@/lib/server/__tests__/_business-calendar';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest, __useDrizzleWithDbForTest,
  getAttachmentRepo, getNotificationRepo, getOutboxRepo,
  getBidRepo, getBizProfileRepo, getContractRepo, getInvitationRepo,
  getPgRequestRepo, getRfpAllowedPgRepo, getRfpRepo, getWorkspaceRepo,
  getRfpRequoteRequestRepo,
  getAuditLogRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile, seedBuyerWorkspace, seedMembership, seedPgWorkspace, seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { auditLogs, bids, notifications, outboxEntries, rfpInvitations, rfpRequoteRequests, rfps, users } from '@/lib/db/schema';
import { RfpService } from '../rfp';
import { subscribe } from '@/lib/server/notifications/bus';
import type { Notification } from '@/lib/types/notification';

let db: PgliteDB;
let service: RfpService;

async function buildService(): Promise<RfpService> {
  const [rfpRepo, contractRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo, requoteRepo, auditRepo, allowedPgRepo, attRepo] =
    await Promise.all([
      getRfpRepo(), getContractRepo(), getWorkspaceRepo(), getBidRepo(),
      getInvitationRepo(), getPgRequestRepo(), getBizProfileRepo(), getRfpRequoteRequestRepo(), getAuditLogRepo(),
      getRfpAllowedPgRepo(), getAttachmentRepo(),
    ]);
  return new RfpService(db, rfpRepo, contractRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo, requoteRepo, auditRepo, allowedPgRepo, attRepo, await getPgMatchingRepo());
}

beforeEach(async () => {
  vi.stubEnv('MASTER_ACCOUNT_EMAILS', '');
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  await seedBusinessCalendar();
  service = await buildService();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); __resetForTest(); });

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

const future = () => validBusinessDeadline(4);

describe('RfpService.requote', () => {
  it('creates a pending requote(round 2), preserves the shared rfp.deadline, notifies PG admin', async () => {
    const s = await seedBidderEnv();
    const [before] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
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
    expect(rfpRow!.deadline.getTime()).toBe(before!.deadline.getTime());

    const notifs = await db.select().from(notifications).where(eq(notifications.userId, s.pgAdmin.id));
    expect(notifs.some((n) => n.type === 'rfp.requote_requested')).toBe(true);
    // PG 딜룸 기본 탭은 요청 조건 — 재요청은 배너·위저드가 있는 견적 작성 탭을 연다.
    const requoteNotif = notifs.find((n) => n.type === 'rfp.requote_requested');
    expect(requoteNotif!.linkUrl).toBe(`/inbox/${rfpRow!.code}?tab=write`);
    expect(requoteNotif!.title).toContain('수정 요청이 도착했어요');

    const emails = await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'rfp.requote_requested'));
    expect(emails.length).toBeGreaterThanOrEqual(1);
    for (const e of emails) expect(e.html).toContain(`/inbox/${rfpRow!.code}?tab=write`);
    for (const e of emails) expect(e.subject).toContain('수정 요청이 도착했어요');
    for (const e of emails) expect(e.html).not.toContain('해당 PG 워크스페이스로 전환');
  });

  it('notifies every approved PG member (not just admin), excludes pending-approval members', async () => {
    const s = await seedBidderEnv();
    const approvedMember = await seedUser(db, { email: 'member@pg.io' });
    await seedMembership(db, s.pgWs.id, approvedMember.id, 'member');
    const pendingMember = await seedUser(db, { email: 'pending@pg.io' });
    await seedMembership(db, s.pgWs.id, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const r = await service.requote(
      s.rfpId,
      { targetPgWsIds: [s.pgWs.id], message: '카드 수수료를 낮춰주세요', newDeadline: future() },
      { userId: s.buyer.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(true);

    const memberNotifs = await db.select().from(notifications).where(eq(notifications.userId, approvedMember.id));
    expect(memberNotifs.some((n) => n.type === 'rfp.requote_requested')).toBe(true);

    const invitedEmails = (
      await db.select({ toAddr: outboxEntries.toAddr }).from(outboxEntries).where(eq(outboxEntries.event, 'rfp.requote_requested'))
    ).map((r) => r.toAddr);
    expect(invitedEmails).toContain('admin@pg.io');
    expect(invitedEmails).toContain('member@pg.io');
    expect(invitedEmails).not.toContain('pending@pg.io');
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

  it('extends an expired pending request in place and records the previous deadline', async () => {
    const s = await seedBidderEnv();
    const requestId = randomUUID();
    const oldDeadline = new Date(Date.now() - 1000);
    await db.insert(rfpRequoteRequests).values({
      id: requestId, rfpId: s.rfpId, pgWsId: s.pgWs.id, round: 2,
      message: '처음 요청', deadline: oldDeadline, status: 'pending',
      createdByUserId: s.buyer.id, createdAt: new Date(),
    });
    const nextDeadline = future();
    const result = await service.requote(s.rfpId, {
      targetPgWsIds: [s.pgWs.id], message: '연장해서 다시 요청해요', newDeadline: nextDeadline,
    }, { userId: s.buyer.id, workspaceId: s.buyerWs.id });
    expect(result.ok).toBe(true);
    const rows = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: requestId, round: 2, message: '연장해서 다시 요청해요' });
    expect(rows[0]!.deadline.getTime()).toBe(nextDeadline.getTime());
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'rfp.requote'));
    expect(logs[0]!.metadata).toMatchObject({ extensions: [{ requestId, oldDeadline: oldDeadline.toISOString(), oldMessage: '처음 요청' }] });
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


describe('requote operator recipients', () => {
  it('notifies registered operators for each target PG without membership, deduplicates members, and isolates workspace feeds', async () => {
    const s = await seedBidderEnv();
    const secondPg = await seedPgWorkspace(db, '두번째 PG');
    const otherPg = await seedPgWorkspace(db, '비대상 PG');
    const otherMember = await seedUser(db);
    await seedMembership(db, otherPg.id, otherMember.id);
    const pendingMember = await seedUser(db);
    await seedMembership(db, s.pgWs.id, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });
    const [originalBid] = await db.select().from(bids);
    const secondInvId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: secondInvId, rfpId: s.rfpId, pgWsId: secondPg.id, tokenHash: randomUUID(),
      expiresAt: future(), status: 'accepted',
    });
    await db.insert(bids).values({ ...originalBid, id: randomUUID(), pgWsId: secondPg.id, invitationId: secondInvId });
    const ops = await seedUser(db, { email: 'Ops@x.com', isSystemAccount: true });
    const deleted = await seedUser(db, { email: 'deleted@x.com' });
    await seedMembership(db, s.pgWs.id, deleted.id);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deleted.id));
    await seedUser(db, { email: 'system@x.com', passwordHash: '!', isSystemAccount: true });
    await db.update(users).set({ lastActiveWorkspaceId: otherPg.id }).where(eq(users.id, ops.id));
    vi.stubEnv('MASTER_ACCOUNT_EMAILS', ' OPS@X.COM, admin@pg.io,ops@x.com, deleted@x.com,system@x.com,missing@x.com, ');
    const emitted: Notification[] = [];
    const unsubscribe = subscribe(ops.id, (n) => emitted.push(n));
    try {
      expect(await service.requote(s.rfpId, {
        targetPgWsIds: [s.pgWs.id, secondPg.id], message: '카드 수수료 조정', newDeadline: future(),
      }, { userId: s.buyer.id, workspaceId: s.buyerWs.id })).toEqual({ ok: true });
    } finally { unsubscribe(); }

    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(4);
    for (const userId of [ops.id, s.pgAdmin.id]) {
      expect(rows.filter((n) => n.userId === userId).map((n) => n.workspaceId).sort())
        .toEqual([s.pgWs.id, secondPg.id].sort());
    }
    expect(emitted).toHaveLength(2);
    const repo = await getNotificationRepo();
    expect(await repo.findRecentForUser(ops.id, otherPg.id, 20)).toEqual([]);
    expect(await repo.findRecentForUser(ops.id, s.pgWs.id, 20)).toHaveLength(1);
    expect(await repo.findRecentForUser(ops.id, secondPg.id, 20)).toHaveLength(1);
    const emails = await db.select().from(outboxEntries);
    expect(emails).toHaveLength(4);
    for (const email of emails) {
      expect(email.html).toContain('해당 PG 워크스페이스로 전환한 뒤 확인해 주세요');
      expect(email.html).toContain('카드 수수료 조정');
      expect(email.html).toContain('/inbox/P-2606-0007?tab=write');
    }
    for (const email of [ops.email, s.pgAdmin.email]) {
      const messages = emails.filter((e) => e.toAddr === email);
      expect(messages.some((e) => e.html.includes('pg.io'))).toBe(true);
      expect(messages.some((e) => e.html.includes('두번째 PG'))).toBe(true);
    }
  });

  it('rejects duplicates without more deliveries and notifies operators again on expired-request extension', async () => {
    const s = await seedBidderEnv();
    const ops = await seedUser(db, { email: 'ops@x.com', isSystemAccount: true });
    vi.stubEnv('MASTER_ACCOUNT_EMAILS', ops.email);
    const input = { targetPgWsIds: [s.pgWs.id], message: '첫 요청', newDeadline: future() };
    const actor = { userId: s.buyer.id, workspaceId: s.buyerWs.id };
    expect(await service.requote(s.rfpId, input, actor)).toEqual({ ok: true });
    expect(await service.requote(s.rfpId, input, actor)).toEqual({ ok: false, error: 'REQUOTE_ALREADY_PENDING' });
    expect(await db.select().from(notifications)).toHaveLength(2);
    expect(await db.select().from(outboxEntries)).toHaveLength(2);
    await db.update(rfpRequoteRequests).set({ deadline: new Date(Date.now() - 1000) });
    expect(await service.requote(s.rfpId, { ...input, message: '연장 요청', newDeadline: validBusinessDeadline(5) }, actor)).toEqual({ ok: true });
    expect(await db.select().from(notifications)).toHaveLength(4);
    const emails = await db.select().from(outboxEntries);
    expect(emails).toHaveLength(4);
    expect(emails.filter((e) => e.toAddr === ops.email)).toHaveLength(2);
  });

  it('rolls back requests, notifications and queued emails when the operator email insert fails, without live delivery', async () => {
    const s = await seedBidderEnv();
    const ops = await seedUser(db, { email: 'ops@x.com' });
    vi.stubEnv('MASTER_ACCOUNT_EMAILS', ops.email);
    const outbox = await getOutboxRepo();
    const enqueue = outbox.enqueueMany.bind(outbox);
    vi.spyOn(outbox, 'enqueueMany').mockImplementation(async (entries, tx) => {
      await enqueue(entries, tx);
      if (entries.some((e) => e.to === ops.email)) throw new Error('operator outbox failure');
    });
    const emitted: Notification[] = [];
    const unsubscribe = subscribe(ops.id, (n) => emitted.push(n));
    try {
      await expect(service.requote(s.rfpId, {
        targetPgWsIds: [s.pgWs.id], message: '수정 요청', newDeadline: future(),
      }, { userId: s.buyer.id, workspaceId: s.buyerWs.id })).rejects.toThrow('operator outbox failure');
    } finally { unsubscribe(); }
    expect(await db.select().from(rfpRequoteRequests)).toEqual([]);
    expect(await db.select().from(notifications)).toEqual([]);
    expect(await db.select().from(outboxEntries)).toEqual([]);
    expect(emitted).toEqual([]);
  });
});
