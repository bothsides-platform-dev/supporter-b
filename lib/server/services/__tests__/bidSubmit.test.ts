import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  bids,
  notifications,
  outboxEntries,
  rfpInvitations,
  rfpRequoteRequests,
  rfps,
} from '@/lib/db/schema';
import { BidService } from '../bid';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: BidService;

async function buildService(): Promise<BidService> {
  const [bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo] = await Promise.all([
    getBidRepo(), getInvitationRepo(), getRfpRepo(),
    getWorkspaceRepo(), getAttachmentRepo(), getBidNoteRepo(),
    getRfpRequoteRequestRepo(), getAuditLogRepo(),
  ]);
  return new BidService(db, bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo);
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
  paymentFees: {} as Record<string, number>,
  customFees: {} as Record<string, number>,
};

// ─── BidService.submit ────────────────────────────────────────────────────────

describe('BidService.submit', () => {
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

  it('샘플 RFP 제출은 구매사 알림/아웃박스를 발행하지 않는다 (bid 는 저장)', async () => {
    const s = await seedSubmitEnv();
    // 온보딩 샘플로 표식 — 소유자는 데모 구매사(.invalid 메일)라 알림/이메일이 정크가 된다.
    await db.update(rfps).set({ isSample: true }).where(eq(rfps.id, s.rfpId));

    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // bid 는 정상 저장된다
    expect(await db.select().from(bids).where(eq(bids.id, r.bidId))).toHaveLength(1);
    // 데모 구매사 인앱 알림/아웃박스 이메일은 발행되지 않는다
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, s.buyerUser.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'bid.submitted')),
    ).toHaveLength(0);
  });
});

// ─── Round-aware submit ────────────────────────────────────────────────────────

async function submitFirst(s: Awaited<ReturnType<typeof seedSubmitEnv>>) {
  return service.submit({ ...BASE, rfpId: s.rfpId }, { userId: s.pgUser.id, workspaceId: s.pgWs.id });
}

describe('BidService.submit round-aware', () => {
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
