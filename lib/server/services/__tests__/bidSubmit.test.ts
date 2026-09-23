import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAttachmentRepo,
  getBidNoteRepo,
  getBidRepo,
  getInvitationRepo,
  getPgSigningTemplateRepo,
  getRfpRepo,
  getRfpRequoteRequestRepo,
  getAuditLogRepo,
  getWorkspaceRepo,
  getPgMatchingRepo,
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
  bids,
  notifications,
  outboxEntries,
  rfpInvitations,
  rfpRequoteRequests,
  rfps,
} from '@/lib/db/schema';
import { BidService } from '../bid';
import type { PgliteDB } from '@/lib/db/client-pglite';
import type { RfpRepo } from '@/lib/server/repositories/types';

let db: PgliteDB;
let service: BidService;

async function buildService(rfpRepoOverride?: RfpRepo): Promise<BidService> {
  const [bidRepo, invRepo, defaultRfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo, templateRepo, matchingRepo] =
    await Promise.all([
      getBidRepo(), getInvitationRepo(), getRfpRepo(),
      getWorkspaceRepo(), getAttachmentRepo(), getBidNoteRepo(),
      getRfpRequoteRequestRepo(), getAuditLogRepo(), getPgSigningTemplateRepo(), getPgMatchingRepo(),
    ]);
  return new BidService(
    db, bidRepo, invRepo, rfpRepoOverride ?? defaultRfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo, templateRepo, matchingRepo,
  );
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __resetForTest();
});

// ─── seed helpers ─────────────────────────────────────────────────────────────

async function seedSubmitEnv() {
  const buyerUser = await seedUser(db, { email: 'buyer@submit.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'pg@submit.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-submit.io');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  const { id: rfpId, code: rfpCode } = await seedRfp(db, {
    buyerWsId: buyerWs.id,
    createdBy: buyerUser.id,
    code: 'P-2606-0099',
  });
  await db
    .update(rfps)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq(rfps.id, rfpId));
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    tokenHash: 'tok-submit-01',
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
    acceptedByUserId: pgUser.id,
  });
  return { buyerUser, buyerWs, pgUser, pgWs, rfpId, rfpCode, invId };
}

const BASE = {
  settleCycle: 'D+1' as const,
  settleLimit: 0,
  guaranteeInsurance: 0,
  signupFee: 0,
  paymentFees: {} as Record<string, number>,
  customFees: {} as Record<string, number>,
};

// ─── BidService.submit ────────────────────────────────────────────────────────

describe('BidService.submit', () => {
  it('제출 회차별로 운영자에게 알리고 중복 제출·슬랙 장애는 업무 결과를 바꾸지 않는다', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T0/B0/test');
    const fetchSpy = vi.fn().mockRejectedValue(new Error('slack unavailable'));
    vi.stubGlobal('fetch', fetchSpy);
    const s = await seedSubmitEnv();
    const actor = { userId: s.pgUser.id, workspaceId: s.pgWs.id };
    expect((await service.submit({ ...BASE, rfpId: s.rfpId }, actor)).ok).toBe(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text).toContain('견적 제출');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text).toContain('pg-submit.io');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text).not.toContain('회차');
    expect((await service.submit({ ...BASE, rfpId: s.rfpId }, actor)).ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await db.insert(rfpRequoteRequests).values({ id: randomUUID(), rfpId: s.rfpId, pgWsId: s.pgWs.id,
      round: 2, message: '재검토 요청', deadline: new Date(Date.now() + 86400000), status: 'pending',
      createdByUserId: s.buyerUser.id, createdAt: new Date() });
    expect((await service.submit({ ...BASE, rfpId: s.rfpId }, actor)).ok).toBe(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).text).toContain('(2회차)');
  });
  it('returns FORBIDDEN when canAccess is false (no invitation)', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: randomUUID() },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });

  it('returns RFP_NOT_OPEN when rfp status is draft', async () => {
    const s = await seedSubmitEnv();
    await db.update(rfps).set({ status: 'draft', sentAt: null }).where(eq(rfps.id, s.rfpId));
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('RFP_NOT_OPEN');
  });

  it('returns RFP_NOT_OPEN when the original request deadline passed', async () => {
    const s = await seedSubmitEnv();
    await db
      .update(rfps)
      .set({ deadline: new Date(Date.now() - 1_000) })
      .where(eq(rfps.id, s.rfpId));
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('RFP_NOT_OPEN');
  });

  it('사전 확인 후 취소된 요청은 쓰기 트랜잭션에서 다시 막는다', async () => {
    const s = await seedSubmitEnv();
    const baseRfpRepo = await getRfpRepo();
    const racingRfpRepo = new Proxy(baseRfpRepo, {
      get(target, property, receiver) {
        if (property === 'findByIdForUpdate') {
          return async (id: string, tx: Parameters<RfpRepo['findById']>[1]) => {
            const current = await target.findById(id, tx);
            return current ? { ...current, status: 'cancelled' as const } : undefined;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const racingService = await buildService(racingRfpRepo);

    const result = await racingService.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );

    expect(result).toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(0);
    expect(
      await db.select().from(notifications).where(eq(notifications.type, 'bid.submitted')),
    ).toHaveLength(0);
    expect(
      await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'bid.submitted')),
    ).toHaveLength(0);
  });

  it('사전 확인 후 요청 행이 사라지면 쓰기 트랜잭션에서 제출을 막는다', async () => {
    const s = await seedSubmitEnv();
    const baseRfpRepo = await getRfpRepo();
    const missingAfterPreflightRepo = new Proxy(baseRfpRepo, {
      get(target, property, receiver) {
        if (property === 'findByIdForUpdate') {
          return async () => undefined;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const racingService = await buildService(missingAfterPreflightRepo);

    const result = await racingService.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );

    expect(result).toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(0);
  });

  it('returns PAYMENT_METHOD_NOT_REQUESTED when disallowed method submitted', async () => {
    const s = await seedSubmitEnv();
    await db
      .update(rfps)
      .set({ requiredPaymentMethods: ['card'] })
      .where(eq(rfps.id, s.rfpId));
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId, paymentFees: { bank_transfer: 0.01 } },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('PAYMENT_METHOD_NOT_REQUESTED');
  });

  it('요청되지 않은 수단의 구간맵도 거부한다', async () => {
    const s = await seedSubmitEnv();
    await db
      .update(rfps)
      .set({ requiredPaymentMethods: ['card'] })
      .where(eq(rfps.id, s.rfpId));
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId, paymentFees: { naver_pay: { general: 0.02 } } },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('PAYMENT_METHOD_NOT_REQUESTED');
  });

  it('returns BID_ALREADY_SUBMITTED when duplicate exists', async () => {
    const s = await seedSubmitEnv();
    const r1 = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r1.ok).toBe(true);
    const r2 = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error).toBe('BID_ALREADY_SUBMITTED');
  });

  it('saves bid and returns bidId + rfpCode', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bidId).toBeTruthy();
    expect(r.rfpCode).toBe(s.rfpCode);
    const rows = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pgWsId).toBe(s.pgWs.id);
  });

  it('persists the given signupFee on the saved bid', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId, signupFee: 330000 },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rows = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect(Number(rows[0]!.signupFee)).toBe(330000);
  });

  it('dispatches in-app notification to buyer members', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, s.buyerUser.id));
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0]!.type).toBe('bid.submitted');
  });

  it('enqueues outbox email to buyer members', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    const entries = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'bid.submitted'));
    expect(entries.length).toBeGreaterThan(0);
  });

  it('does not notify a pending-approval buyer member (in-app or email)', async () => {
    const s = await seedSubmitEnv();
    const pendingMember = await seedUser(db, { email: 'pending@submit.com' });
    await seedMembership(db, s.buyerWs.id, pendingMember.id, 'member', { approvalStatus: 'pending_approval' });

    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, pendingMember.id));
    expect(notifs).toHaveLength(0);

    const entries = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'pending@submit.com'));
    expect(entries).toHaveLength(0);
  });

  it('every submit notifies the buyer — no sample-flag skip exists anymore', async () => {
    const s = await seedSubmitEnv();

    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(await db.select().from(bids).where(eq(bids.id, r.bidId))).toHaveLength(1);
    // buyer always gets an in-app notification + outbox email — unconditionally.
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, s.buyerUser.id)),
    ).not.toHaveLength(0);
    expect(
      await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'bid.submitted')),
    ).not.toHaveLength(0);
  });
});

// ─── Round-aware submit ────────────────────────────────────────────────────────

async function submitFirst(s: Awaited<ReturnType<typeof seedSubmitEnv>>) {
  return service.submit({ ...BASE, rfpId: s.rfpId }, { userId: s.pgUser.id, workspaceId: s.pgWs.id });
}

describe('BidService.submit round-aware', () => {
  it('같은 PG의 동시 최초 제출은 하나만 성공하고 견적도 한 건만 남는다', async () => {
    const s = await seedSubmitEnv();
    const actor = { userId: s.pgUser.id, workspaceId: s.pgWs.id };

    const results = await Promise.all([
      service.submit({ ...BASE, rfpId: s.rfpId }, actor),
      service.submit({ ...BASE, rfpId: s.rfpId }, actor),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: 'BID_ALREADY_SUBMITTED' },
    ]);
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(1);
    expect(
      await db.select().from(notifications).where(eq(notifications.type, 'bid.submitted')),
    ).toHaveLength(1);
    expect(
      await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'bid.submitted')),
    ).toHaveLength(1);
  });

  it('blocks resubmission when no pending requote exists', async () => {
    const s = await seedSubmitEnv();
    expect((await submitFirst(s)).ok).toBe(true);
    const again = await submitFirst(s);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('BID_ALREADY_SUBMITTED');
  });

  it('allows round-2 submit when a pending requote exists; marks it responded', async () => {
    const s = await seedSubmitEnv();
    expect((await submitFirst(s)).ok).toBe(true);

    await db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '낮춰주세요',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });

    const r2 = await service.submit({ ...BASE, rfpId: s.rfpId }, { userId: s.pgUser.id, workspaceId: s.pgWs.id });
    expect(r2.ok).toBe(true);

    const myBids = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
    expect(myBids.map((b) => b.round).sort()).toEqual([1, 2]);

    const reqs = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(reqs[0]!.status).toBe('responded');
  });

  it('rejects round-2 submit after the requote deadline passed', async () => {
    const s = await seedSubmitEnv();
    expect((await submitFirst(s)).ok).toBe(true);
    await db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '낮춰주세요',
      deadline: new Date(Date.now() - 1000),
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });
    const r2 = await service.submit({ ...BASE, rfpId: s.rfpId }, { userId: s.pgUser.id, workspaceId: s.pgWs.id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('REQUOTE_DEADLINE_PASSED');
  });

  it('재요청 마감 직전 제출이 잠금을 기다리는 사이 기한을 넘기면 최종 쓰기에서 거부한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));
    const s = await seedSubmitEnv();
    expect((await submitFirst(s)).ok).toBe(true);
    await db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '낮춰주세요',
      deadline: new Date('2026-09-14T00:00:01.000Z'),
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });

    const baseRfpRepo = await getRfpRepo();
    const lockedLookup = baseRfpRepo.findByIdForUpdate.bind(baseRfpRepo);
    const deadlineRacingRepo = new Proxy(baseRfpRepo, {
      get(target, property, receiver) {
        if (property === 'findByIdForUpdate') {
          return async (...args: Parameters<RfpRepo['findByIdForUpdate']>) => {
            const current = await lockedLookup(...args);
            vi.setSystemTime(new Date('2026-09-14T00:00:02.000Z'));
            return current;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const racingService = await buildService(deadlineRacingRepo);

    const result = await racingService.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );

    expect(result).toEqual({ ok: false, error: 'REQUOTE_DEADLINE_PASSED' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(1);
  });
});

// ─── 감사 로그 (C5) ───────────────────────────────────────────────────────────

describe('BidService.submit — 감사 로그 기록', () => {
  it('submit 성공 시 bid.submit 감사 행을 남긴다 (제출 트랜잭션과 함께 커밋)', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'bid.submit'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: s.pgUser.id,
      actorWorkspaceId: s.pgWs.id,
      entityType: 'rfp',
      entityId: s.rfpCode,
    });
  });
});
