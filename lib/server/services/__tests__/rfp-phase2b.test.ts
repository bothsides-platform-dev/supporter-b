import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

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
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  auditLogs,
  rfpAllowedPg,
  rfpInvitations,
  rfpPgRequests,
  rfps,
  bizProfiles,
  notifications,
  outboxEntries,
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

// ─── Seed helpers ─────────────────────────────────────────────────────────────

type RejectEnv = {
  buyerUserId: string;
  buyerWsId: string;
  pgWsId: string;
  rfpId: string;
  rfpCode: string;
  requestId: string;
};

async function seedRejectEnv(): Promise<RejectEnv> {
  const buyerUser = await seedUser(db, { email: 'buyer@reject.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@reject.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-reject');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id, code: 'P-2606-0101' });
  await db.update(rfps).set({ status: 'sent', sentAt: new Date() }).where(eq(rfps.id, rfp.id));

  const requestId = randomUUID();
  await db.insert(rfpPgRequests).values({
    id: requestId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    message: '참여 요청',
    status: 'pending',
    createdByUserId: pgUser.id,
    createdAt: new Date(),
  });

  return { buyerUserId: buyerUser.id, buyerWsId: buyerWs.id, pgWsId: pgWs.id, rfpId: rfp.id, rfpCode: rfp.code, requestId };
}

type CreatePgReqEnv = {
  buyerWsId: string;
  pgUserId: string;
  pgWsId: string;
  rfpId: string;
  rfpCode: string;
};

async function seedCreatePgRequestEnv(): Promise<CreatePgReqEnv> {
  const buyerUser = await seedUser(db, { email: 'buyer@cpgreq.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@cpgreq.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-cpgreq');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id, code: 'P-2606-0201' });
  await db.update(rfps).set({ status: 'sent', sentAt: new Date(), boardVisible: true }).where(eq(rfps.id, rfp.id));

  return { buyerWsId: buyerWs.id, pgUserId: pgUser.id, pgWsId: pgWs.id, rfpId: rfp.id, rfpCode: rfp.code };
}

type AcceptEnv = RejectEnv;

async function seedAcceptEnv(): Promise<AcceptEnv> {
  const buyerUser = await seedUser(db, { email: 'buyer@accept.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@accept.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-accept');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id, code: 'P-2606-0301' });
  await db.update(rfps).set({ status: 'sent', sentAt: new Date(), deadline: new Date(Date.now() + 7 * 86400_000) }).where(eq(rfps.id, rfp.id));

  const requestId = randomUUID();
  await db.insert(rfpPgRequests).values({
    id: requestId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    message: '참여 요청',
    status: 'pending',
    createdByUserId: pgUser.id,
    createdAt: new Date(),
  });

  return { buyerUserId: buyerUser.id, buyerWsId: buyerWs.id, pgWsId: pgWs.id, rfpId: rfp.id, rfpCode: rfp.code, requestId };
}

type AddWsEnv = {
  buyerUserId: string;
  buyerWsId: string;
  pgWsId: string;
  rfpId: string;
  rfpCode: string;
};

async function seedAddWsEnv(): Promise<AddWsEnv> {
  const buyerUser = await seedUser(db, { email: 'buyer@addws.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@addws.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-addws');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id, code: 'P-2606-0401' });
  await db.update(rfps).set({ status: 'sent', sentAt: new Date(), deadline: new Date(Date.now() + 7 * 86400_000) }).where(eq(rfps.id, rfp.id));

  return { buyerUserId: buyerUser.id, buyerWsId: buyerWs.id, pgWsId: pgWs.id, rfpId: rfp.id, rfpCode: rfp.code };
}

type SendDraftEnv = {
  buyerWsId: string;
  buyerUserId: string;
  pgWsId: string;
  rfpId: string;
  rfpCode: string;
};

async function seedSendDraftEnv(): Promise<SendDraftEnv> {
  const buyerUser = await seedUser(db, { email: 'buyer@senddraft.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@senddraft.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-senddraft');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id, code: 'P-2606-0501' });
  await db.update(rfps).set({ status: 'sent', sentAt: new Date(), deadline: new Date(Date.now() + 7 * 86400_000), title: 'Send Draft Test RFP' }).where(eq(rfps.id, rfp.id));

  return { buyerWsId: buyerWs.id, buyerUserId: buyerUser.id, pgWsId: pgWs.id, rfpId: rfp.id, rfpCode: rfp.code };
}

type CreateRfpEnv = {
  buyerUserId: string;
  buyerWsId: string;
  pgWsId: string;
};

async function seedCreateRfpEnv(): Promise<CreateRfpEnv> {
  const buyerUser = await seedUser(db, { email: 'buyer@crfp.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@crfp.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-crfp');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  return { buyerUserId: buyerUser.id, buyerWsId: buyerWs.id, pgWsId: pgWs.id };
}

// ─── RfpService.rejectPgRequest ───────────────────────────────────────────────

describe('RfpService.rejectPgRequest', () => {
  it('NOT_FOUND when request does not exist', async () => {
    const { buyerWsId, buyerUserId } = await seedRejectEnv();
    const result = await service.rejectPgRequest(randomUUID(), { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('NOT_PENDING when request is already decided', async () => {
    const env = await seedRejectEnv();
    await db.update(rfpPgRequests).set({ status: 'accepted' }).where(eq(rfpPgRequests.id, env.requestId));
    const result = await service.rejectPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_PENDING' });
  });

  it('NOT_OWNED when buyer workspace does not own the rfp', async () => {
    const env = await seedRejectEnv();
    const otherBuyer = await seedUser(db, { email: 'other@reject.com' });
    const otherWs = await seedBuyerWorkspace(db);
    await seedMembership(db, otherWs.id, otherBuyer.id, 'admin');
    const result = await service.rejectPgRequest(env.requestId, { userId: otherBuyer.id, workspaceId: otherWs.id });
    expect(result).toEqual({ ok: false, error: 'NOT_OWNED' });
  });

  it('marks request rejected and dispatches notification to PG members', async () => {
    const env = await seedRejectEnv();
    const result = await service.rejectPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: true });

    const [req] = await db.select({ status: rfpPgRequests.status }).from(rfpPgRequests).where(eq(rfpPgRequests.id, env.requestId));
    expect(req!.status).toBe('rejected');
  });

  it('승인 대기(pending_approval) PG 멤버에게는 pg.request.rejected 인앱 알림을 보내지 않는다', async () => {
    const env = await seedRejectEnv();
    const pendingMember = await seedUser(db, { email: 'pending@reject.com' });
    await seedMembership(db, env.pgWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const result = await service.rejectPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: true });

    const pendingNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, pendingMember.id), eq(notifications.type, 'pg.request.rejected')));
    expect(pendingNotifs).toHaveLength(0);
  });
});

// ─── RfpService.createPgRequest ──────────────────────────────────────────────

describe('RfpService.createPgRequest', () => {
  it('NOT_FOUND when rfp code does not exist', async () => {
    const { pgUserId, pgWsId } = await seedCreatePgRequestEnv();
    const result = await service.createPgRequest('P-9999-9999', 'hi', { userId: pgUserId, workspaceId: pgWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('NOT_FOUND when boardVisible is false', async () => {
    const env = await seedCreatePgRequestEnv();
    await db.update(rfps).set({ boardVisible: false }).where(eq(rfps.id, env.rfpId));
    const result = await service.createPgRequest(env.rfpCode, 'hi', { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('RFP_NOT_OPEN when rfp status is not sent', async () => {
    const env = await seedCreatePgRequestEnv();
    await db.update(rfps).set({ status: 'draft' }).where(eq(rfps.id, env.rfpId));
    const result = await service.createPgRequest(env.rfpCode, 'hi', { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(result).toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
  });

  it('RFP_DEADLINE_PASSED when deadline is in the past', async () => {
    const env = await seedCreatePgRequestEnv();
    await db.update(rfps).set({ deadline: new Date(Date.now() - 1000) }).where(eq(rfps.id, env.rfpId));
    const result = await service.createPgRequest(env.rfpCode, 'hi', { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(result).toEqual({ ok: false, error: 'RFP_DEADLINE_PASSED' });
  });

  it('ALREADY_PARTICIPATING when pg workspace is already in allowlist', async () => {
    const env = await seedCreatePgRequestEnv();
    await db.insert(rfpAllowedPg).values({ rfpId: env.rfpId, pgWsId: env.pgWsId });
    const result = await service.createPgRequest(env.rfpCode, 'hi', { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(result).toEqual({ ok: false, error: 'ALREADY_PARTICIPATING' });
  });

  it('ALREADY_REQUESTED when a prior request exists', async () => {
    const env = await seedCreatePgRequestEnv();
    await db.insert(rfpPgRequests).values({
      id: randomUUID(), rfpId: env.rfpId, pgWsId: env.pgWsId,
      message: 'prior', status: 'pending', createdByUserId: env.pgUserId, createdAt: new Date(),
    });
    const result = await service.createPgRequest(env.rfpCode, 'hi', { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(result).toEqual({ ok: false, error: 'ALREADY_REQUESTED' });
  });

  it('creates request and dispatches notification to buyer members', async () => {
    const env = await seedCreatePgRequestEnv();
    const result = await service.createPgRequest(env.rfpCode, 'hello buyer!', { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(result).toEqual({ ok: true });

    const rows = await db.select().from(rfpPgRequests).where(and(eq(rfpPgRequests.rfpId, env.rfpId), eq(rfpPgRequests.pgWsId, env.pgWsId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toBe('hello buyer!');
  });

  it('승인 대기(pending_approval) 구매사 멤버에게는 pg.request.received 인앱 알림을 보내지 않는다', async () => {
    const env = await seedCreatePgRequestEnv();
    const pendingMember = await seedUser(db, { email: 'pending@cpgreq.com' });
    await seedMembership(db, env.buyerWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const result = await service.createPgRequest(env.rfpCode, 'hello buyer!', { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(result).toEqual({ ok: true });

    const pendingNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, pendingMember.id), eq(notifications.type, 'pg.request.received')));
    expect(pendingNotifs).toHaveLength(0);
  });
});

// ─── RfpService.acceptPgRequest ──────────────────────────────────────────────

describe('RfpService.acceptPgRequest', () => {
  it('NOT_FOUND when request does not exist', async () => {
    const { buyerUserId, buyerWsId } = await seedAcceptEnv();
    const result = await service.acceptPgRequest(randomUUID(), { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('NOT_PENDING when request already decided', async () => {
    const env = await seedAcceptEnv();
    await db.update(rfpPgRequests).set({ status: 'rejected' }).where(eq(rfpPgRequests.id, env.requestId));
    const result = await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_PENDING' });
  });

  it('NOT_OWNED when actor does not own the rfp', async () => {
    const env = await seedAcceptEnv();
    const other = await seedUser(db, { email: 'other@accept.com' });
    const otherWs = await seedBuyerWorkspace(db);
    await seedMembership(db, otherWs.id, other.id, 'admin');
    const result = await service.acceptPgRequest(env.requestId, { userId: other.id, workspaceId: otherWs.id });
    expect(result).toEqual({ ok: false, error: 'NOT_OWNED' });
  });

  it('RFP_NOT_OPEN when rfp is not sent', async () => {
    const env = await seedAcceptEnv();
    await db.update(rfps).set({ status: 'closed' }).where(eq(rfps.id, env.rfpId));
    const result = await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
  });

  it('RFP_DEADLINE_PASSED when rfp deadline is past', async () => {
    const env = await seedAcceptEnv();
    await db.update(rfps).set({ deadline: new Date(Date.now() - 1000) }).where(eq(rfps.id, env.rfpId));
    const result = await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: false, error: 'RFP_DEADLINE_PASSED' });
  });

  it('creates new invitation when none exists', async () => {
    const env = await seedAcceptEnv();
    const result = await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: true });

    const invRows = await db.select().from(rfpInvitations).where(and(eq(rfpInvitations.rfpId, env.rfpId), eq(rfpInvitations.pgWsId, env.pgWsId)));
    expect(invRows).toHaveLength(1);
    expect(invRows[0]!.status).toBe('pending');
  });

  it('promotes draft invitation to pending', async () => {
    const env = await seedAcceptEnv();
    const invId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    await db.insert(rfpInvitations).values({
      id: invId, rfpId: env.rfpId, pgWsId: env.pgWsId,
      tokenHash: `draft-${invId}`, sentAt: new Date(), expiresAt, status: 'draft',
    });

    const result = await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: true });

    const [row] = await db.select({ status: rfpInvitations.status }).from(rfpInvitations).where(eq(rfpInvitations.id, invId));
    expect(row!.status).toBe('pending');
  });

  it('marks request as accepted', async () => {
    const env = await seedAcceptEnv();
    await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    const [req] = await db.select({ status: rfpPgRequests.status }).from(rfpPgRequests).where(eq(rfpPgRequests.id, env.requestId));
    expect(req!.status).toBe('accepted');
  });

  it('sends the rfp.invited email to every approved PG member, not just admins', async () => {
    const env = await seedAcceptEnv();
    const approvedMember = await seedUser(db, { email: 'member@accept.com' });
    await seedMembership(db, env.pgWsId, approvedMember.id, 'member');
    const pendingMember = await seedUser(db, { email: 'pending@accept.com' });
    await seedMembership(db, env.pgWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const result = await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: true });

    const invitedEmails = (
      await db.select({ toAddr: outboxEntries.toAddr }).from(outboxEntries).where(eq(outboxEntries.event, 'rfp.invited'))
    ).map((r) => r.toAddr);
    expect(invitedEmails).toContain('pg@accept.com'); // admin
    expect(invitedEmails).toContain('member@accept.com'); // approved member
    expect(invitedEmails).not.toContain('pending@accept.com'); // pending-approval member excluded
  });

  it('승인 대기(pending_approval) PG 멤버에게는 pg.request.accepted 인앱 알림을 보내지 않는다', async () => {
    const env = await seedAcceptEnv();
    const pendingMember = await seedUser(db, { email: 'pending-inapp@accept.com' });
    await seedMembership(db, env.pgWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const result = await service.acceptPgRequest(env.requestId, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: true });

    const pendingNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, pendingMember.id), eq(notifications.type, 'pg.request.accepted')));
    expect(pendingNotifs).toHaveLength(0);
  });
});

// ─── RfpService.addPgWorkspaces ───────────────────────────────────────────────

describe('RfpService.addPgWorkspaces', () => {
  it('NOT_FOUND when rfp code does not exist', async () => {
    const { buyerUserId, buyerWsId } = await seedAddWsEnv();
    const result = await service.addPgWorkspaces('P-9999-9999', [randomUUID()], { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('NOT_OWNED when actor does not own the rfp', async () => {
    const env = await seedAddWsEnv();
    const other = await seedUser(db, { email: 'other@addws.com' });
    const otherWs = await seedBuyerWorkspace(db);
    const result = await service.addPgWorkspaces(env.rfpCode, [env.pgWsId], { userId: other.id, workspaceId: otherWs.id });
    expect(result).toEqual({ ok: false, error: 'NOT_OWNED' });
  });

  it('RFP_NOT_OPEN when rfp is not sent', async () => {
    const env = await seedAddWsEnv();
    await db.update(rfps).set({ status: 'draft' }).where(eq(rfps.id, env.rfpId));
    const result = await service.addPgWorkspaces(env.rfpCode, [env.pgWsId], { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
  });

  it('INVALID_WORKSPACE when any id is not a pg workspace', async () => {
    const env = await seedAddWsEnv();
    const buyerUser2 = await seedUser(db, { email: 'buyer2@addws.com' });
    const nonPgWs = await seedBuyerWorkspace(db);
    await seedMembership(db, nonPgWs.id, buyerUser2.id);
    const result = await service.addPgWorkspaces(env.rfpCode, [nonPgWs.id], { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: false, error: 'INVALID_WORKSPACE' });
  });

  it('adds workspaces and creates draft invitations', async () => {
    const env = await seedAddWsEnv();
    const result = await service.addPgWorkspaces(env.rfpCode, [env.pgWsId], { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toMatchObject({ ok: true, addedCount: 1, skipped: [] });

    const invRows = await db.select().from(rfpInvitations).where(and(eq(rfpInvitations.rfpId, env.rfpId), eq(rfpInvitations.pgWsId, env.pgWsId)));
    expect(invRows).toHaveLength(1);
    expect(invRows[0]!.status).toBe('draft');
  });

  it('skips already-allowed workspaces', async () => {
    const env = await seedAddWsEnv();
    await db.insert(rfpAllowedPg).values({ rfpId: env.rfpId, pgWsId: env.pgWsId });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({ id: invId, rfpId: env.rfpId, pgWsId: env.pgWsId, tokenHash: `draft-${invId}`, sentAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000), status: 'draft' });

    const result = await service.addPgWorkspaces(env.rfpCode, [env.pgWsId], { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toMatchObject({ ok: true, addedCount: 0, skipped: [env.pgWsId] });
  });
});

// ─── RfpService.sendDraftInvitations ─────────────────────────────────────────

describe('RfpService.sendDraftInvitations', () => {
  it('NOT_FOUND when rfp code does not exist', async () => {
    const { buyerUserId, buyerWsId } = await seedSendDraftEnv();
    const result = await service.sendDraftInvitations('P-9999-9999', { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('NOT_OWNED when actor does not own the rfp', async () => {
    const env = await seedSendDraftEnv();
    const other = await seedUser(db, { email: 'other@sdi.com' });
    const otherWs = await seedBuyerWorkspace(db);
    const result = await service.sendDraftInvitations(env.rfpCode, { userId: other.id, workspaceId: otherWs.id });
    expect(result).toEqual({ ok: false, error: 'NOT_OWNED' });
  });

  it('returns sentCount=0 when no drafts exist', async () => {
    const env = await seedSendDraftEnv();
    const result = await service.sendDraftInvitations(env.rfpCode, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toEqual({ ok: true, sentCount: 0 });
  });

  it('promotes all drafts to pending and returns sentCount', async () => {
    const env = await seedSendDraftEnv();
    await db.insert(rfpAllowedPg).values({ rfpId: env.rfpId, pgWsId: env.pgWsId });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId, rfpId: env.rfpId, pgWsId: env.pgWsId,
      tokenHash: `draft-${invId}`, sentAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000), status: 'draft',
    });

    const result = await service.sendDraftInvitations(env.rfpCode, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toMatchObject({ ok: true, sentCount: 1 });

    const [row] = await db.select({ status: rfpInvitations.status, tokenHash: rfpInvitations.tokenHash })
      .from(rfpInvitations).where(eq(rfpInvitations.id, invId));
    expect(row!.status).toBe('pending');
    expect(row!.tokenHash).not.toMatch(/^draft-/);
  });

  it('sends the rfp.invited email to every approved PG member, not just admins', async () => {
    const env = await seedSendDraftEnv();
    const approvedMember = await seedUser(db, { email: 'member@senddraft.com' });
    await seedMembership(db, env.pgWsId, approvedMember.id, 'member');
    const pendingMember = await seedUser(db, { email: 'pending@senddraft.com' });
    await seedMembership(db, env.pgWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    await db.insert(rfpAllowedPg).values({ rfpId: env.rfpId, pgWsId: env.pgWsId });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId, rfpId: env.rfpId, pgWsId: env.pgWsId,
      tokenHash: `draft-${invId}`, sentAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000), status: 'draft',
    });

    const result = await service.sendDraftInvitations(env.rfpCode, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toMatchObject({ ok: true, sentCount: 1 });

    const invitedEmails = (
      await db.select({ toAddr: outboxEntries.toAddr }).from(outboxEntries).where(eq(outboxEntries.event, 'rfp.invited'))
    ).map((r) => r.toAddr);
    expect(invitedEmails).toContain('pg@senddraft.com'); // admin
    expect(invitedEmails).toContain('member@senddraft.com'); // approved member
    expect(invitedEmails).not.toContain('pending@senddraft.com'); // pending-approval member excluded
  });

  it('승인 대기(pending_approval) PG 멤버에게는 rfp.invited 인앱 알림을 보내지 않는다', async () => {
    const env = await seedSendDraftEnv();
    const pendingMember = await seedUser(db, { email: 'pending-inapp@senddraft.com' });
    await seedMembership(db, env.pgWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    await db.insert(rfpAllowedPg).values({ rfpId: env.rfpId, pgWsId: env.pgWsId });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId, rfpId: env.rfpId, pgWsId: env.pgWsId,
      tokenHash: `draft-${invId}`, sentAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000), status: 'draft',
    });

    const result = await service.sendDraftInvitations(env.rfpCode, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toMatchObject({ ok: true, sentCount: 1 });

    const pendingNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, pendingMember.id), eq(notifications.type, 'rfp.invited')));
    expect(pendingNotifs).toHaveLength(0);
  });
});

// ─── RfpService.createRfp ────────────────────────────────────────────────────

describe('RfpService.createRfp', () => {
  it('INVALID_BIZ_PROFILE when override mode has no override fields', async () => {
    const { buyerUserId, buyerWsId } = await seedCreateRfpEnv();
    const result = await service.createRfp({
      title: 'test', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [], rfpAttachmentIds: [],
      requiredPaymentMethods: [], customPaymentMethods: [],
      send: false, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'override',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result).toEqual({ ok: false, error: 'INVALID_BIZ_PROFILE' });
  });

  it('creates draft rfp when send=false', async () => {
    const { buyerUserId, buyerWsId } = await seedCreateRfpEnv();
    const result = await service.createRfp({
      title: 'Draft RFP', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [], rfpAttachmentIds: [],
      requiredPaymentMethods: [], customPaymentMethods: [],
      send: false, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'none',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rfpCode = result.rfpId;

    const [row] = await db.select({ status: rfps.status }).from(rfps).where(eq(rfps.code, rfpCode));
    expect(row!.status).toBe('draft');
  });

  it('creates rfp with bizProfileMode=none (no biz_profile_id)', async () => {
    const { buyerUserId, buyerWsId } = await seedCreateRfpEnv();
    const result = await service.createRfp({
      title: 'None BizProfile', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [], rfpAttachmentIds: [],
      requiredPaymentMethods: [], customPaymentMethods: [],
      send: false, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'none',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select({ bizProfileId: rfps.bizProfileId }).from(rfps).where(eq(rfps.code, result.rfpId));
    expect(row!.bizProfileId).toBeNull();
  });

  it('creates biz_profile snapshot with override mode', async () => {
    const { buyerUserId, buyerWsId } = await seedCreateRfpEnv();
    const result = await service.createRfp({
      title: 'Override BizProfile', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [], rfpAttachmentIds: [],
      requiredPaymentMethods: [], customPaymentMethods: [],
      send: false, boardVisible: true, currentFeeVisibleToPg: true,
      bizProfileMode: 'override', bizNoOverride: '9876543210',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select({ bizProfileId: rfps.bizProfileId }).from(rfps).where(eq(rfps.code, result.rfpId));
    expect(row!.bizProfileId).not.toBeNull();
    const [biz] = await db.select({ bizNo: bizProfiles.bizNo }).from(bizProfiles).where(eq(bizProfiles.id, row!.bizProfileId!));
    expect(biz!.bizNo).toBe('9876543210');
  });

  it('sends invitations and creates rfp as sent when send=true', async () => {
    const { buyerUserId, buyerWsId, pgWsId } = await seedCreateRfpEnv();
    const result = await service.createRfp({
      title: 'Sent RFP', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [pgWsId], rfpAttachmentIds: [],
      requiredPaymentMethods: ['card'], customPaymentMethods: [],
      send: true, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'none',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select({ status: rfps.status }).from(rfps).where(eq(rfps.code, result.rfpId));
    expect(row!.status).toBe('sent');

    const invRows = await db.select().from(rfpInvitations).where(eq(rfpInvitations.pgWsId, pgWsId));
    expect(invRows).toHaveLength(1);
    expect(invRows[0]!.status).toBe('pending');
  });

  it('sends the rfp.invited email to every approved PG member, not just admins', async () => {
    const { buyerUserId, buyerWsId, pgWsId } = await seedCreateRfpEnv();
    const approvedMember = await seedUser(db, { email: 'member@crfp.com' });
    await seedMembership(db, pgWsId, approvedMember.id, 'member');
    const pendingMember = await seedUser(db, { email: 'pending@crfp.com' });
    await seedMembership(db, pgWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const result = await service.createRfp({
      title: 'Sent RFP All Members', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [pgWsId], rfpAttachmentIds: [],
      requiredPaymentMethods: ['card'], customPaymentMethods: [],
      send: true, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'none',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result.ok).toBe(true);

    const invitedEmails = (
      await db.select({ toAddr: outboxEntries.toAddr }).from(outboxEntries).where(eq(outboxEntries.event, 'rfp.invited'))
    ).map((r) => r.toAddr);
    expect(invitedEmails).toContain('pg@crfp.com'); // admin
    expect(invitedEmails).toContain('member@crfp.com'); // approved member
    expect(invitedEmails).not.toContain('pending@crfp.com'); // pending-approval member excluded
  });

  it('즉시 발송(send=true) 시 승인 대기(pending_approval) PG 멤버에게는 rfp.invited 인앱 알림을 보내지 않는다', async () => {
    const { buyerUserId, buyerWsId, pgWsId } = await seedCreateRfpEnv();
    const pendingMember = await seedUser(db, { email: 'pending-inapp@crfp.com' });
    await seedMembership(db, pgWsId, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const result = await service.createRfp({
      title: 'Sent RFP Pending Excluded', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [pgWsId], rfpAttachmentIds: [],
      requiredPaymentMethods: ['card'], customPaymentMethods: [],
      send: true, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'none',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result.ok).toBe(true);

    const pendingNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, pendingMember.id), eq(notifications.type, 'rfp.invited')));
    expect(pendingNotifs).toHaveLength(0);
  });
});

// ─── 감사 로그 (C5) ───────────────────────────────────────────────────────────

describe('RfpService createRfp/sendDraftInvitations — 감사 로그 기록', () => {
  it('createRfp 성공 시 rfp.create 감사 행을 남긴다', async () => {
    const { buyerUserId, buyerWsId } = await seedCreateRfpEnv();
    const result = await service.createRfp({
      title: '감사 RFP', deadline: new Date(Date.now() + 7 * 86400_000),
      allowedPgWorkspaceIds: [], rfpAttachmentIds: [],
      requiredPaymentMethods: [], customPaymentMethods: [],
      send: false, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'none',
    }, { userId: buyerUserId, workspaceId: buyerWsId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'rfp.create'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: buyerUserId,
      actorWorkspaceId: buyerWsId,
      entityType: 'rfp',
      entityId: result.rfpId,
    });
    expect(rows[0]!.metadata).toMatchObject({ title: '감사 RFP', send: false });
  });

  it('sendDraftInvitations 성공(발송>0) 시 rfp.send_invitations 감사 행을 남긴다', async () => {
    const env = await seedSendDraftEnv();
    await db.insert(rfpAllowedPg).values({ rfpId: env.rfpId, pgWsId: env.pgWsId });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId, rfpId: env.rfpId, pgWsId: env.pgWsId,
      tokenHash: `draft-${invId}`, sentAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000), status: 'draft',
    });

    const result = await service.sendDraftInvitations(env.rfpCode, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    expect(result).toMatchObject({ ok: true, sentCount: 1 });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'rfp.send_invitations'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: env.buyerUserId,
      actorWorkspaceId: env.buyerWsId,
      entityType: 'rfp',
      entityId: env.rfpCode,
    });
    expect(rows[0]!.metadata).toMatchObject({ sentCount: 1 });
  });

  it('보낼 draft 가 없으면(sentCount=0 no-op) 감사 행을 남기지 않는다', async () => {
    const env = await seedSendDraftEnv();
    await service.sendDraftInvitations(env.rfpCode, { userId: env.buyerUserId, workspaceId: env.buyerWsId });
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'rfp.send_invitations'));
    expect(rows).toHaveLength(0);
  });
});
