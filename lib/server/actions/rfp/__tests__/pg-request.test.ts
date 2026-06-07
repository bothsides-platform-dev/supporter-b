import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';

import {
  notifications,
  outboxEntries,
  rfpAllowedPg,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  getInvitationRepo,
  getPgRequestRepo,
} from '@/lib/server/repositories/factory';
import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessUser = {
  id: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
};
const sessionRef: { value: { user: SessUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
  requireBuyerSession: () =>
    sessionRef.value?.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
  requirePgSession: () =>
    sessionRef.value?.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
}));

import { createPgRequestAction } from '../createPgRequestAction';
import { acceptPgRequestAction } from '../acceptPgRequestAction';
import { rejectPgRequestAction } from '../rejectPgRequestAction';
import { setRfpBoardVisibilityAction } from '../setRfpBoardVisibilityAction';

let db: PgliteDB;

function asBuyer(u: { id: string; email: string }, wsId: string, role: 'admin' | 'member' = 'admin') {
  sessionRef.value = { user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'buyer', role } };
}
function asPg(u: { id: string; email: string }, wsId: string, role: 'admin' | 'member' = 'admin') {
  sessionRef.value = { user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'pg', role } };
}

async function insertRfp(
  opts: { buyerWsId: string; createdBy: string; code: string; status?: 'draft' | 'sent'; deadlineMs?: number; boardVisible?: boolean },
): Promise<string> {
  const id = randomUUID();
  await db.insert(rfps).values({
    id,
    code: opts.code,
    buyerWsId: opts.buyerWsId,
    title: '오픈 RFP',
    memo: '',
    websiteUrl: 'https://buyer.example.com',
    deadline: new Date(Date.now() + (opts.deadlineMs ?? 7 * 86_400_000)),
    status: opts.status ?? 'sent',
    boardVisible: opts.boardVisible ?? true,
    createdBy: opts.createdBy,
  });
  return id;
}

async function world() {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id, name: '구매사ABC' });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgAdmin = await seedUser(db, { email: 'pgadmin@toss.im' });
  await seedMembership(db, pgWs.id, pgAdmin.id, 'admin');
  return { buyer, biz, buyerWs, pgWs, pgAdmin };
}

describe('pg-request actions', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  describe('createPgRequestAction', () => {
    it('creates a pending request + notifies the buyer in-app', async () => {
      const w = await world();
      const code = 'P-2605-0001';
      await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      asPg(w.pgAdmin, w.pgWs.id);

      const res = await createPgRequestAction({ rfpId: code, message: '제안 드리고 싶습니다.' });
      expect(res.ok).toBe(true);

      const reqRepo = await getPgRequestRepo();
      const rfpRow = (await db.select({ id: rfps.id }).from(rfps).where(eq(rfps.code, code)))[0];
      expect(await reqRepo.findPairStatus(rfpRow.id, w.pgWs.id)).toBe('pending');

      const buyerNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.workspaceId, w.buyerWs.id));
      expect(buyerNotifs.some((n) => n.type === 'pg.request.received')).toBe(true);
    });

    it('rejects a buyer session with FORBIDDEN_PG', async () => {
      const w = await world();
      const code = 'P-2605-0002';
      await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      asBuyer(w.buyer, w.buyerWs.id);
      const res = await createPgRequestAction({ rfpId: code, message: 'hi' });
      expect(res).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    });

    it('blocks duplicate requests (ALREADY_REQUESTED)', async () => {
      const w = await world();
      const code = 'P-2605-0003';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      const reqRepo = await getPgRequestRepo();
      await reqRepo.create({
        id: randomUUID(),
        rfpId,
        pgWsId: w.pgWs.id,
        message: 'first',
        status: 'pending',
        createdByUserId: w.pgAdmin.id,
        createdAt: new Date().toISOString(),
      });
      asPg(w.pgAdmin, w.pgWs.id);
      const res = await createPgRequestAction({ rfpId: code, message: 'again' });
      expect(res).toEqual({ ok: false, error: 'ALREADY_REQUESTED' });
    });

    it('blocks when the PG is already allowlisted (ALREADY_PARTICIPATING)', async () => {
      const w = await world();
      const code = 'P-2605-0004';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      await db.insert(rfpAllowedPg).values({ rfpId, pgWsId: w.pgWs.id });
      asPg(w.pgAdmin, w.pgWs.id);
      const res = await createPgRequestAction({ rfpId: code, message: 'hi' });
      expect(res).toEqual({ ok: false, error: 'ALREADY_PARTICIPATING' });
    });

    it('blocks a past-deadline RFP (RFP_DEADLINE_PASSED)', async () => {
      const w = await world();
      const code = 'P-2605-0005';
      await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code, deadlineMs: -1000 });
      asPg(w.pgAdmin, w.pgWs.id);
      const res = await createPgRequestAction({ rfpId: code, message: 'hi' });
      expect(res).toEqual({ ok: false, error: 'RFP_DEADLINE_PASSED' });
    });
  });

  describe('acceptPgRequestAction', () => {
    it('allowlists + invites (real token) + notifies + emails, all in one commit', async () => {
      const w = await world();
      const code = 'P-2605-1000';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      const reqRepo = await getPgRequestRepo();
      const requestId = randomUUID();
      await reqRepo.create({
        id: requestId,
        rfpId,
        pgWsId: w.pgWs.id,
        message: '제안합니다',
        status: 'pending',
        createdByUserId: w.pgAdmin.id,
        createdAt: new Date().toISOString(),
      });

      asBuyer(w.buyer, w.buyerWs.id);
      const res = await acceptPgRequestAction({ requestId });
      expect(res.ok).toBe(true);

      // allowlist row added
      const allow = await db
        .select()
        .from(rfpAllowedPg)
        .where(and(eq(rfpAllowedPg.rfpId, rfpId), eq(rfpAllowedPg.pgWsId, w.pgWs.id)));
      expect(allow).toHaveLength(1);

      // invitation row with a REAL token (not a draft placeholder)
      const invs = await db
        .select()
        .from(rfpInvitations)
        .where(and(eq(rfpInvitations.rfpId, rfpId), eq(rfpInvitations.pgWsId, w.pgWs.id)));
      expect(invs).toHaveLength(1);
      expect(invs[0].tokenHash.startsWith('draft-')).toBe(false);

      // PG can now access
      const invRepo = await getInvitationRepo();
      expect(await invRepo.canAccess(rfpId, w.pgWs.id)).toBe(true);

      // request marked accepted
      expect((await reqRepo.findById(requestId))?.status).toBe('accepted');

      // PG member in-app notif
      const pgNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.workspaceId, w.pgWs.id));
      expect(pgNotifs.some((n) => n.type === 'pg.request.accepted')).toBe(true);

      // rfp.invited email enqueued
      const outbox = await db
        .select()
        .from(outboxEntries)
        .where(eq(outboxEntries.event, 'rfp.invited'));
      expect(outbox.length).toBeGreaterThanOrEqual(1);
    });

    it('is idempotent when the PG is already allowlisted+invited (no duplicate-invitation crash)', async () => {
      const w = await world();
      const code = 'P-2605-1001';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      // Pre-existing allowlist + invitation (e.g. buyer added them separately).
      await db.insert(rfpAllowedPg).values({ rfpId, pgWsId: w.pgWs.id });
      await db.insert(rfpInvitations).values({
        id: randomUUID(),
        rfpId,
        pgWsId: w.pgWs.id,
        tokenHash: `real-${randomUUID()}`,
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: 'pending',
      });
      const reqRepo = await getPgRequestRepo();
      const requestId = randomUUID();
      await reqRepo.create({
        id: requestId,
        rfpId,
        pgWsId: w.pgWs.id,
        message: 'x',
        status: 'pending',
        createdByUserId: w.pgAdmin.id,
        createdAt: new Date().toISOString(),
      });

      asBuyer(w.buyer, w.buyerWs.id);
      const res = await acceptPgRequestAction({ requestId });
      expect(res.ok).toBe(true);
      expect((await reqRepo.findById(requestId))?.status).toBe('accepted');
    });

    it('upgrades a pre-existing DRAFT invitation so the accepted PG can access', async () => {
      // Buyer separately added this PG via RfpInviteManager first → a draft
      // invitation (never sent) exists. Accepting the pending request must
      // upgrade it to a real/sent invitation, not skip it (draft ∉ canAccess).
      const w = await world();
      const code = 'P-2605-1004';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      await db.insert(rfpAllowedPg).values({ rfpId, pgWsId: w.pgWs.id });
      const draftInvId = randomUUID();
      await db.insert(rfpInvitations).values({
        id: draftInvId,
        rfpId,
        pgWsId: w.pgWs.id,
        tokenHash: `draft-${draftInvId}`,
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: 'draft',
      });
      const reqRepo = await getPgRequestRepo();
      const requestId = randomUUID();
      await reqRepo.create({
        id: requestId,
        rfpId,
        pgWsId: w.pgWs.id,
        message: 'x',
        status: 'pending',
        createdByUserId: w.pgAdmin.id,
        createdAt: new Date().toISOString(),
      });

      asBuyer(w.buyer, w.buyerWs.id);
      const res = await acceptPgRequestAction({ requestId });
      expect(res.ok).toBe(true);

      const invRepo = await getInvitationRepo();
      expect(await invRepo.canAccess(rfpId, w.pgWs.id)).toBe(true);
      const invs = await db
        .select()
        .from(rfpInvitations)
        .where(and(eq(rfpInvitations.rfpId, rfpId), eq(rfpInvitations.pgWsId, w.pgWs.id)));
      expect(invs).toHaveLength(1);
      expect(invs[0].status).not.toBe('draft');
      expect(invs[0].tokenHash.startsWith('draft-')).toBe(false);
    });

    it('rejects a non-pending request (NOT_PENDING)', async () => {
      const w = await world();
      const code = 'P-2605-1002';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      const reqRepo = await getPgRequestRepo();
      const requestId = randomUUID();
      await reqRepo.create({
        id: requestId,
        rfpId,
        pgWsId: w.pgWs.id,
        message: 'x',
        status: 'accepted',
        createdByUserId: w.pgAdmin.id,
        createdAt: new Date().toISOString(),
      });
      asBuyer(w.buyer, w.buyerWs.id);
      const res = await acceptPgRequestAction({ requestId });
      expect(res).toEqual({ ok: false, error: 'NOT_PENDING' });
    });

    it('rejects a request on another buyer’s RFP (NOT_OWNED)', async () => {
      const w = await world();
      const code = 'P-2605-1003';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      const reqRepo = await getPgRequestRepo();
      const requestId = randomUUID();
      await reqRepo.create({
        id: requestId,
        rfpId,
        pgWsId: w.pgWs.id,
        message: 'x',
        status: 'pending',
        createdByUserId: w.pgAdmin.id,
        createdAt: new Date().toISOString(),
      });
      // A different buyer.
      const other = await seedUser(db, { email: 'other@x.com' });
      const otherWs = await seedBuyerWorkspace(db, { name: '다른구매사' });
      await seedMembership(db, otherWs.id, other.id, 'admin');
      asBuyer(other, otherWs.id);
      const res = await acceptPgRequestAction({ requestId });
      expect(res).toEqual({ ok: false, error: 'NOT_OWNED' });
    });
  });

  describe('rejectPgRequestAction', () => {
    it('marks the request rejected, notifies the PG, and keeps it off the board', async () => {
      const w = await world();
      const code = 'P-2605-2000';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      const reqRepo = await getPgRequestRepo();
      const requestId = randomUUID();
      await reqRepo.create({
        id: requestId,
        rfpId,
        pgWsId: w.pgWs.id,
        message: 'x',
        status: 'pending',
        createdByUserId: w.pgAdmin.id,
        createdAt: new Date().toISOString(),
      });
      asBuyer(w.buyer, w.buyerWs.id);
      const res = await rejectPgRequestAction({ requestId });
      expect(res.ok).toBe(true);
      expect((await reqRepo.findById(requestId))?.status).toBe('rejected');

      const pgNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.workspaceId, w.pgWs.id));
      expect(pgNotifs.some((n) => n.type === 'pg.request.rejected')).toBe(true);

      // Rejected request keeps the RFP excluded from the board (no re-request).
      const codes = (await reqRepo.findOpenRfpsForPg(w.pgWs.id, new Date())).map((r) => r.rfpCode);
      expect(codes).not.toContain(code);
    });
  });

  describe('setRfpBoardVisibilityAction', () => {
    it('toggles board visibility off (drops from board) and back on', async () => {
      const w = await world();
      const code = 'P-2605-3000';
      const rfpId = await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      const reqRepo = await getPgRequestRepo();
      const otherPg = await seedPgWorkspace(db, '이니시스');

      asBuyer(w.buyer, w.buyerWs.id);
      let res = await setRfpBoardVisibilityAction({ rfpId: code, visible: false });
      expect(res.ok).toBe(true);
      let codes = (await reqRepo.findOpenRfpsForPg(otherPg.id, new Date())).map((r) => r.rfpCode);
      expect(codes).not.toContain(code);

      res = await setRfpBoardVisibilityAction({ rfpId: code, visible: true });
      expect(res.ok).toBe(true);
      codes = (await reqRepo.findOpenRfpsForPg(otherPg.id, new Date())).map((r) => r.rfpCode);
      expect(codes).toContain(code);
      void rfpId;
    });

    it('rejects a non-owner buyer (NOT_OWNED)', async () => {
      const w = await world();
      const code = 'P-2605-3001';
      await insertRfp({ buyerWsId: w.buyerWs.id, createdBy: w.buyer.id, code });
      const other = await seedUser(db, { email: 'other2@x.com' });
      const otherWs = await seedBuyerWorkspace(db, { name: '다른구매사2' });
      await seedMembership(db, otherWs.id, other.id, 'admin');
      asBuyer(other, otherWs.id);
      const res = await setRfpBoardVisibilityAction({ rfpId: code, visible: false });
      expect(res).toEqual({ ok: false, error: 'NOT_OWNED' });
    });
  });
});
