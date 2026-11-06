import { EMPTY_BID_DRAFT } from '@/lib/quote/bid-draft';
import { draftQuoteTerms } from '@/lib/quote/draft-schema';
import { projectQuoteTerms } from '@/lib/quote/terms';
import { getBidDraftService } from '../bid-draft';
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
  getBidDraftRepo,
  getUserRepo,
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
  attachments,
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
  const [
    bidRepo,
    invRepo,
    defaultRfpRepo,
    wsRepo,
    attRepo,
    bidNoteRepo,
    requoteRepo,
    auditRepo,
    templateRepo,
    matchingRepo,
  ] = await Promise.all([
    getBidRepo(),
    getInvitationRepo(),
    getRfpRepo(),
    getWorkspaceRepo(),
    getAttachmentRepo(),
    getBidNoteRepo(),
    getRfpRequoteRequestRepo(),
    getAuditLogRepo(),
    getPgSigningTemplateRepo(),
    getPgMatchingRepo(),
  ]);
  return new BidService(
    db,
    bidRepo,
    invRepo,
    rfpRepoOverride ?? defaultRfpRepo,
    wsRepo,
    attRepo,
    bidNoteRepo,
    requoteRepo,
    auditRepo,
    templateRepo,
    matchingRepo,
    await getBidDraftRepo(),
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
  await db.update(rfps).set({ status: 'sent', sentAt: new Date() }).where(eq(rfps.id, rfpId));
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
    const first = await service.submit({ ...BASE, rfpId: s.rfpId }, actor);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('first submission failed');
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text).toContain('견적 제출');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text).toContain('pg-submit.io');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text).not.toContain('회차');
    expect((await service.submit({ ...BASE, rfpId: s.rfpId }, actor)).ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const requestId = randomUUID();
    const deadline = new Date(Date.now() + 86400000);
    await db.insert(rfpRequoteRequests).values({
      id: requestId,
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '재검토 요청',
      deadline,
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });
    expect(
      (
        await service.submit(
          {
            ...BASE,
            rfpId: s.rfpId,
            expectedRequoteId: requestId,
            expectedRequoteDeadline: deadline.toISOString(),
            baseBidId: first.bidId,
          },
          actor,
        )
      ).ok,
    ).toBe(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).text).toContain('(2회차)');
    expect(
      await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'bid.submitted')),
    ).toHaveLength(2);
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
      {
        ...BASE,
        rfpId: s.rfpId,
        paymentFees: { naver_pay: { general: 0.02 } },
      },
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
    await seedMembership(db, s.buyerWs.id, pendingMember.id, 'member', {
      approvalStatus: 'pending_approval',
    });

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
  return service.submit(
    { ...BASE, rfpId: s.rfpId },
    { userId: s.pgUser.id, workspaceId: s.pgWs.id },
  );
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
    const first = await submitFirst(s);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('first submission failed');

    const requestId = randomUUID();
    const deadline = new Date(Date.now() + 86_400_000);
    await db.insert(rfpRequoteRequests).values({
      id: requestId,
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '낮춰주세요',
      deadline,
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });

    const r2 = await service.submit(
      {
        ...BASE,
        rfpId: s.rfpId,
        expectedRequoteId: requestId,
        expectedRequoteDeadline: deadline.toISOString(),
        baseBidId: first.bidId,
      },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r2.ok).toBe(true);

    const myBids = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
    expect(myBids.map((b) => b.round).sort()).toEqual([1, 2]);

    const reqs = await db
      .select()
      .from(rfpRequoteRequests)
      .where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(reqs[0]!.status).toBe('responded');
  });

  it('rejects a stale tab after a newer revision request opens', async () => {
    const s = await seedSubmitEnv();
    const first = await submitFirst(s);
    if (!first.ok) throw new Error('first submission failed');
    const staleRequestId = randomUUID();
    await db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '새 수정',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });
    const stale = await service.submit(
      {
        ...BASE,
        rfpId: s.rfpId,
        expectedRequoteId: staleRequestId,
        baseBidId: first.bidId,
      },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(stale).toEqual({ ok: false, error: 'REQUOTE_CHANGED' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(1);
  });

  it('keeps the previous proposal without changing its attachment owner', async () => {
    const s = await seedSubmitEnv();
    const first = await submitFirst(s);
    if (!first.ok) throw new Error('first submission failed');
    const attachmentId = randomUUID();
    await db.insert(attachments).values({
      id: attachmentId,
      bidId: first.bidId,
      name: 'original.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: s.pgUser.id,
    });
    const requestId = randomUUID();
    const deadline = new Date(Date.now() + 86_400_000);
    await db.insert(rfpRequoteRequests).values({
      id: requestId,
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '수정',
      deadline,
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });
    const second = await service.submit(
      {
        ...BASE,
        rfpId: s.rfpId,
        expectedRequoteId: requestId,
        expectedRequoteDeadline: deadline.toISOString(),
        baseBidId: first.bidId,
        reuseProposal: true,
      },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.error);
    expect(
      (await (await getBidRepo()).findById(second.bidId))!.proposalPdfs.map((file) => file.id),
    ).toEqual([attachmentId]);
    const [owner] = await db
      .select({ bidId: attachments.bidId })
      .from(attachments)
      .where(eq(attachments.id, attachmentId));
    expect(owner!.bidId).toBe(first.bidId);

    const thirdRequestId = randomUUID();
    const thirdDeadline = new Date(Date.now() + 2 * 86_400_000);
    await db.insert(rfpRequoteRequests).values({
      id: thirdRequestId,
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 3,
      message: '한 번 더 수정',
      deadline: thirdDeadline,
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });
    const third = await service.submit(
      {
        ...BASE,
        rfpId: s.rfpId,
        expectedRequoteId: thirdRequestId,
        expectedRequoteDeadline: thirdDeadline.toISOString(),
        baseBidId: second.bidId,
        reuseProposal: true,
      },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(third.ok).toBe(true);
    if (!third.ok) throw new Error(third.error);
    expect(
      (await (await getBidRepo()).findById(third.bidId))!.proposalPdfs.map((file) => file.id),
    ).toEqual([attachmentId]);
    const [thirdRow] = await db
      .select({ sourceBidId: bids.proposalSourceBidId })
      .from(bids)
      .where(eq(bids.id, third.bidId));
    expect(thirdRow!.sourceBidId).toBe(first.bidId);
  });

  it('rejects a tab opened before the same request deadline was extended', async () => {
    const s = await seedSubmitEnv();
    const first = await submitFirst(s);
    if (!first.ok) throw new Error('first submission failed');
    const requestId = randomUUID();
    const oldDeadline = new Date(Date.now() + 86_400_000);
    await db.insert(rfpRequoteRequests).values({
      id: requestId,
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '수정',
      deadline: new Date(oldDeadline.getTime() + 86_400_000),
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });
    const stale = await service.submit(
      {
        ...BASE,
        rfpId: s.rfpId,
        expectedRequoteId: requestId,
        expectedRequoteDeadline: oldDeadline.toISOString(),
        baseBidId: first.bidId,
      },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(stale).toEqual({ ok: false, error: 'REQUOTE_CHANGED' });
  });

  it('rejects reuse when a prior bid points at another PG’s proposal', async () => {
    const s = await seedSubmitEnv();
    const first = await submitFirst(s);
    if (!first.ok) throw new Error(first.error);
    const rivalWs = await seedPgWorkspace(db, 'rival-pg.io');
    const rivalBidId = randomUUID();
    const [firstRow] = await db.select().from(bids).where(eq(bids.id, first.bidId));
    await db.insert(bids).values({ ...firstRow!, id: rivalBidId, pgWsId: rivalWs.id });
    const rivalFileId = randomUUID();
    await db.insert(attachments).values({
      id: rivalFileId,
      bidId: rivalBidId,
      name: 'rival.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: s.pgUser.id,
    });
    await db.update(bids).set({ proposalSourceBidId: rivalBidId }).where(eq(bids.id, first.bidId));
    const requestId = randomUUID();
    const deadline = new Date(Date.now() + 86_400_000);
    await db.insert(rfpRequoteRequests).values({
      id: requestId,
      rfpId: s.rfpId,
      pgWsId: s.pgWs.id,
      round: 2,
      message: '수정',
      deadline,
      status: 'pending',
      createdByUserId: s.buyerUser.id,
      createdAt: new Date(),
    });

    expect(
      await service.submit(
        {
          ...BASE,
          rfpId: s.rfpId,
          expectedRequoteId: requestId,
          expectedRequoteDeadline: deadline.toISOString(),
          baseBidId: first.bidId,
          reuseProposal: true,
        },
        { userId: s.pgUser.id, workspaceId: s.pgWs.id },
      ),
    ).toEqual({ ok: false, error: 'INVALID_ATTACHMENT' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(2);
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
    const r2 = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('REQUOTE_DEADLINE_PASSED');
  });

  it('재요청 마감 직전 제출이 잠금을 기다리는 사이 기한을 넘기면 최종 쓰기에서 거부한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));
    const s = await seedSubmitEnv();
    const first = await submitFirst(s);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('first submission failed');
    const requestId = randomUUID();
    await db.insert(rfpRequoteRequests).values({
      id: requestId,
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
      {
        ...BASE,
        rfpId: s.rfpId,
        expectedRequoteId: requestId,
        expectedRequoteDeadline: '2026-09-14T00:00:01.000Z',
        baseBidId: first.bidId,
      },
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

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'bid.submit'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: s.pgUser.id,
      actorWorkspaceId: s.pgWs.id,
      entityType: 'rfp',
      entityId: s.rfpCode,
    });
  });
});

describe('개인 서버 초안과 v2 제출', () => {
  const content = {
    ...EMPTY_BID_DRAFT,
    settleLimit: '50000000',
    signupFee: '',
    guaranteeInsurance: '',
    conditionStates: {
      signupFee: 'negotiable' as const,
      guaranteeInsurance: 'not_applicable' as const,
      'card:general': 'confirmed' as const,
    },
    fees: { 'card:general': '2.5' },
    memo: '초안의 추가 조건',
  };
  async function setup() {
    const env = await seedSubmitEnv();
    const scope = {
      userId: env.pgUser.id,
      workspaceId: env.pgWs.id,
      rfpId: env.rfpId,
      roundKey: 'initial',
    };
    const drafts = await getBidDraftService();
    const saved = await drafts.save(scope, content, 0);
    if (!saved.ok) throw new Error(saved.error);
    const terms = draftQuoteTerms(content, ['card'], []);
    const input = {
      ...BASE,
      rfpId: env.rfpId,
      settleLimit: 50000000,
      ...projectQuoteTerms(terms),
      quoteTerms: terms,
      draft: { scope, revision: saved.draft.revision },
    };
    return {
      ...env,
      scope,
      drafts,
      input,
      saved: saved.draft,
      actor: { userId: scope.userId, workspaceId: scope.workspaceId },
    };
  }
  it('서로 다른 사용자의 초안은 분리하고 오래된 revision은 현재 입력을 덮어쓰지 않는다', async () => {
    const s = await setup();
    const teammate = await seedUser(db, { email: 'teammate@submit.com' });
    await seedMembership(db, s.pgWs.id, teammate.id, 'member');
    expect(await s.drafts.load({ ...s.scope, userId: teammate.id })).toMatchObject({
      ok: true,
      draft: null,
    });
    expect((await s.drafts.save(s.scope, { ...content, memo: '다른 탭' }, 1)).ok).toBe(true);
    expect(await s.drafts.save(s.scope, content, 1)).toEqual({
      ok: false,
      error: 'DRAFT_CONFLICT',
    });
    expect(await s.drafts.load(s.scope)).toMatchObject({
      ok: true,
      draft: { revision: 2, content: { memo: '다른 탭' } },
    });
    expect(await s.drafts.remove(s.scope, 1)).toEqual({
      ok: false,
      error: 'DRAFT_CONFLICT',
    });
    expect(await db.select().from(notifications)).toHaveLength(0);
    expect(await db.select().from(outboxEntries)).toHaveLength(0);
  });
  it('같은 초안의 동시 제출·응답 유실 후 재시도는 같은 견적과 한 번의 알림을 반환한다', async () => {
    const s = await setup();
    const results = await Promise.all([
      service.submit(s.input, s.actor),
      service.submit(s.input, s.actor),
    ]);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toEqual(results[0]);
    expect(await service.submit(s.input, s.actor)).toEqual(results[0]);
    const [row] = await db.select().from(bids);
    expect(row.signupFee).toBeNull();
    expect(row.guaranteeInsurance).toBeNull();
    const display = await (await getBidRepo()).findById(row.id);
    expect(display).toMatchObject({
      signupFee: null,
      guaranteeInsurance: null,
      quoteTerms: {
        _v: 2,
        signupFee: { state: 'negotiable' },
        guaranteeInsurance: { state: 'not_applicable' },
      },
      paymentFees: { card: { general: 0.025 } },
    });
    expect(await db.select().from(bids)).toHaveLength(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
    expect(await db.select().from(outboxEntries)).toHaveLength(1);
    expect(await s.drafts.load(s.scope)).toMatchObject({
      draft: { submittedBidId: row.id },
    });
  });
  it('초안 저장 후 변경된 revision과 다른 계정·워크스페이스의 제출을 거부한다', async () => {
    const s = await setup();
    await s.drafts.save(s.scope, { ...content, memo: '새 조건' }, 1);
    expect(await service.submit(s.input, s.actor)).toEqual({
      ok: false,
      error: 'DRAFT_CONFLICT',
    });
    expect(await service.submit(s.input, { ...s.actor, userId: randomUUID() })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await service.submit(s.input, { ...s.actor, workspaceId: randomUUID() })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await db.select().from(bids)).toHaveLength(0);
  });
  it('계정 탈퇴는 다른 사용자의 초안을 보존하고 본인 초안을 정리한다', async () => {
    const s = await setup();
    const teammate = await seedUser(db, { email: 'retained@submit.com' });
    await seedMembership(db, s.pgWs.id, teammate.id, 'member');
    const otherScope = { ...s.scope, userId: teammate.id };
    expect((await s.drafts.save(otherScope, content, 0)).ok).toBe(true);
    await (await getUserRepo()).softDelete(s.pgUser.id);
    expect(await (await getBidDraftRepo()).list(s.scope)).toEqual([]);
    expect(await (await getBidDraftRepo()).list(otherScope)).toHaveLength(1);
  });
  it('마감 뒤 조회·삭제만 허용하고 저장·제출은 거부한다', async () => {
    const s = await setup();
    await db
      .update(rfps)
      .set({ deadline: new Date(Date.now() - 1000) })
      .where(eq(rfps.id, s.rfpId));
    expect(await s.drafts.load(s.scope)).toMatchObject({
      ok: true,
      readOnly: true,
      draft: { revision: 1 },
    });
    expect(await s.drafts.save(s.scope, content, 1)).toEqual({
      ok: false,
      error: 'DRAFT_READ_ONLY',
    });
    expect(await service.submit(s.input, s.actor)).toEqual({
      ok: false,
      error: 'RFP_NOT_OPEN',
    });
    expect(await s.drafts.remove(s.scope, 1)).toEqual({ ok: true });
    expect(await db.select().from(bids)).toHaveLength(0);
  });
  it('ready 상태와 첨부 업로더·워크스페이스를 저장 및 제출 시 재검증한다', async () => {
    const s = await setup();
    const id = randomUUID();
    await db.insert(attachments).values({
      id,
      name: 'offer.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: s.pgUser.id,
      uploadWorkspaceId: s.pgWs.id,
      status: 'ready',
    });
    const fileContent = {
      ...content,
      proposalChoice: 'replace' as const,
      uploadedProposal: { id, name: 'offer.pdf', size: 100 },
    };
    expect((await s.drafts.save(s.scope, fileContent, 1)).ok).toBe(true);
    await db
      .update(attachments)
      .set({ uploadWorkspaceId: s.buyerWs.id })
      .where(eq(attachments.id, id));
    expect(await s.drafts.save(s.scope, fileContent, 2)).toEqual({
      ok: false,
      error: 'INVALID_ATTACHMENT',
    });
    expect(
      await service.submit(
        {
          ...s.input,
          proposalAttachmentId: id,
          draft: { scope: s.scope, revision: 2 },
        },
        s.actor,
      ),
    ).toEqual({ ok: false, error: 'INVALID_ATTACHMENT' });
    expect(await db.select().from(bids)).toHaveLength(0);
    expect(await s.drafts.load(s.scope)).toMatchObject({
      attachmentInvalid: true,
      draft: { submittedBidId: null },
    });
  });
  it('첨부 연결 실패는 견적·알림·초안 소비를 모두 롤백한다', async () => {
    const s = await setup();
    const id = randomUUID();
    await db.insert(attachments).values({
      id,
      name: 'offer.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: s.pgUser.id,
      uploadWorkspaceId: s.pgWs.id,
      status: 'ready',
    });
    vi.spyOn(await getAttachmentRepo(), 'claim').mockResolvedValueOnce([]);
    expect(await service.submit({ ...s.input, proposalAttachmentId: id }, s.actor)).toEqual({
      ok: false,
      error: 'INVALID_ATTACHMENT',
    });
    expect(await db.select().from(bids)).toHaveLength(0);
    expect(await db.select().from(notifications)).toHaveLength(0);
    expect(await s.drafts.load(s.scope)).toMatchObject({
      draft: { submittedBidId: null },
    });
  });
});
