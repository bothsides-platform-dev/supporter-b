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
  getPgSigningTemplateRepo,
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
  pgSigningTemplates,
  rfpInvitations,
  rfpRequoteRequests,
  rfps,
} from '@/lib/db/schema';
import { BidService } from '../bid';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: BidService;

async function buildService(): Promise<BidService> {
  const [bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo, signingTemplateRepo] = await Promise.all([
    getBidRepo(), getInvitationRepo(), getRfpRepo(),
    getWorkspaceRepo(), getAttachmentRepo(), getBidNoteRepo(),
    getRfpRequoteRequestRepo(), getAuditLogRepo(), getPgSigningTemplateRepo(),
  ]);
  return new BidService(db, bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo, signingTemplateRepo);
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
  signupFee: 0,
  paymentFees: {} as Record<string, number>,
  customFees: {} as Record<string, number>,
};

// ─── BidService.submit ────────────────────────────────────────────────────────

describe('BidService.submit', () => {
  // 견적별 계약서 템플릿 — 선정 후 딜룸 픽커의 기본 선택이 된다. 선택 사항.
  describe('signing template pre-selection', () => {
    async function seedTemplate(workspaceId: string, createdBy: string) {
      const id = randomUUID();
      await db.insert(pgSigningTemplates).values({
        id,
        workspaceId,
        snowsignTemplateId: `tmpl_${id.slice(0, 8)}`,
        name: '가맹계약서',
        roleMapping: { 구매사: 'buyer', PG: 'pg' },
        createdBy,
      });
      return id;
    }

    it('persists the chosen template with the bid', async () => {
      const s = await seedSubmitEnv();
      const templateId = await seedTemplate(s.pgWs.id, s.pgUser.id);
      const r = await service.submit(
        { ...BASE, rfpId: s.rfpId, signingTemplateId: templateId },
        { userId: s.pgUser.id, workspaceId: s.pgWs.id },
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const bidRepo = await getBidRepo();
      expect(await bidRepo.findSigningTemplateId(r.bidId)).toBe(templateId);
    });

    it('stores null when no template is chosen', async () => {
      const s = await seedSubmitEnv();
      const r = await service.submit(
        { ...BASE, rfpId: s.rfpId },
        { userId: s.pgUser.id, workspaceId: s.pgWs.id },
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const bidRepo = await getBidRepo();
      expect(await bidRepo.findSigningTemplateId(r.bidId)).toBeNull();
    });

    // FK 만으로는 테넌트가 강제되지 않는다 — 서비스가 소유 스코프를 검사해야 한다.
    it("rejects another PG workspace's template", async () => {
      const s = await seedSubmitEnv();
      const otherWs = await seedPgWorkspace(db, 'other-pg.io');
      const foreignId = await seedTemplate(otherWs.id, s.pgUser.id);

      const r = await service.submit(
        { ...BASE, rfpId: s.rfpId, signingTemplateId: foreignId },
        { userId: s.pgUser.id, workspaceId: s.pgWs.id },
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toBe('INVALID_SIGNING_TEMPLATE');
    });

    it('rejects a template id that does not exist', async () => {
      const s = await seedSubmitEnv();
      const r = await service.submit(
        { ...BASE, rfpId: s.rfpId, signingTemplateId: randomUUID() },
        { userId: s.pgUser.id, workspaceId: s.pgWs.id },
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toBe('INVALID_SIGNING_TEMPLATE');
    });
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
