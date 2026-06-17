import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import { rfps, rfpAllowedPg, rfpPgRequests } from '@/lib/db/schema';
import { DrizzleRfpRequestRepository } from '../rfp-pg-request';
import type { PgRequest, PgRequestStatus } from '@/lib/types/pg-request';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from './_seed';

type RfpOpts = {
  buyerWsId: string;
  createdBy: string;
  code: string;
  status?: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  deadlineMs?: number; // offset from now
  websiteUrl?: string | null;
  boardVisible?: boolean;
  title?: string;
  mainProducts?: string | null;
  requiredPaymentMethods?: string[];
  customPaymentMethods?: { id: string; label: string }[];
};

async function insertRfp(db: PgliteDB, o: RfpOpts): Promise<string> {
  const id = randomUUID();
  await db.insert(rfps).values({
    id,
    code: o.code,
    buyerWsId: o.buyerWsId,
    title: o.title ?? 'RFP 제목',
    memo: '',
    websiteUrl: o.websiteUrl === undefined ? 'https://buyer.example.com' : o.websiteUrl,
    mainProducts: o.mainProducts === undefined ? null : o.mainProducts,
    requiredPaymentMethods: o.requiredPaymentMethods ?? [],
    customPaymentMethods: o.customPaymentMethods ?? [],
    // 핵심 거래정보(현재조건 브리프)는 문서·숨김목록에 — 게시판 projection 에 절대 새면 안 된다.
    currentTerms: { _v: 1, feeRate: '2.5%', annualPgVolume: '연 100억' },
    hiddenFromPg: ['currentTerms.feeRate'],
    deadline: new Date(Date.now() + (o.deadlineMs ?? 86_400_000)),
    status: o.status ?? 'sent',
    boardVisible: o.boardVisible ?? true,
    createdBy: o.createdBy,
  });
  return id;
}

function makeRequest(
  rfpId: string,
  pgWsId: string,
  createdByUserId: string,
  overrides?: Partial<PgRequest>,
): PgRequest {
  return {
    id: randomUUID(),
    rfpId,
    pgWsId,
    message: '안녕하세요, 이 건에 제안 드리고 싶습니다.',
    status: 'pending',
    createdByUserId,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db);
  const ws = await seedBuyerWorkspace(db, { name: '구매사ABC' });
  const pgWs = await seedPgWorkspace(db, '서포터 B 페이');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });
  const repo = new DrizzleRfpRequestRepository(db);
  return { db, repo, buyer, ws, pgWs, pgUser };
}

describe('DrizzleRfpRequestRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleRfpRequestRepository;

  beforeEach(async () => {
    ctx = await setup();
    repo = ctx.repo;
  });

  it('create inserts a pending row; findPairStatus reports it', async () => {
    const rfpId = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-0001' });
    await repo.create(makeRequest(rfpId, ctx.pgWs.id, ctx.pgUser.id));

    expect(await repo.findPairStatus(rfpId, ctx.pgWs.id)).toBe<PgRequestStatus>('pending');
    // No request for an unrelated pair → undefined.
    const otherPg = await seedPgWorkspace(ctx.db, '이니시스');
    expect(await repo.findPairStatus(rfpId, otherPg.id)).toBeUndefined();
  });

  it('duplicate (rfp, pg) request throws (UNIQUE constraint)', async () => {
    const rfpId = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-0002' });
    await repo.create(makeRequest(rfpId, ctx.pgWs.id, ctx.pgUser.id));
    await expect(repo.create(makeRequest(rfpId, ctx.pgWs.id, ctx.pgUser.id))).rejects.toThrow();
  });

  it('markDecided flips pending→accepted atomically; second call is a no-op', async () => {
    const rfpId = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-0003' });
    const req = makeRequest(rfpId, ctx.pgWs.id, ctx.pgUser.id);
    await repo.create(req);

    await repo.markDecided(req.id, 'accepted', ctx.buyer.id, new Date());
    let row = await repo.findById(req.id);
    expect(row?.status).toBe('accepted');
    expect(row?.decidedByUserId).toBe(ctx.buyer.id);
    expect(row?.decidedAt).toBeDefined();

    // Already-accepted: WHERE status='pending' guard makes this a no-op (no flip to rejected).
    await repo.markDecided(req.id, 'rejected', ctx.buyer.id, new Date());
    row = await repo.findById(req.id);
    expect(row?.status).toBe('accepted');
  });

  it('findByRfp returns all requests for the RFP', async () => {
    const rfpId = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-0004' });
    const pg2 = await seedPgWorkspace(ctx.db, '이니시스');
    await repo.create(makeRequest(rfpId, ctx.pgWs.id, ctx.pgUser.id));
    await repo.create(makeRequest(rfpId, pg2.id, ctx.pgUser.id));
    const list = await repo.findByRfp(rfpId);
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.rfpId === rfpId)).toBe(true);
  });

  describe('findOpenRfpsForPg', () => {
    it('includes only sent + future-deadline + board_visible RFPs', async () => {
      const open = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-1000' });
      await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-1001', status: 'draft' });
      await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-1002', deadlineMs: -1000 });
      await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-1003', boardVisible: false });
      await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-1004', status: 'awarded' });

      const codes = (await repo.findOpenRfpsForPg(ctx.pgWs.id, new Date())).map((r) => r.rfpCode);
      expect(codes).toContain('P-2605-1000');
      expect(codes).not.toContain('P-2605-1001'); // draft
      expect(codes).not.toContain('P-2605-1002'); // past deadline
      expect(codes).not.toContain('P-2605-1003'); // hidden
      expect(codes).not.toContain('P-2605-1004'); // awarded
      void open;
    });

    it('excludes RFPs the PG is already allowlisted for', async () => {
      const rfpId = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-2000' });
      await ctx.db.insert(rfpAllowedPg).values({ rfpId, pgWsId: ctx.pgWs.id });
      const codes = (await repo.findOpenRfpsForPg(ctx.pgWs.id, new Date())).map((r) => r.rfpCode);
      expect(codes).not.toContain('P-2605-2000');
      // …but visible to a different PG.
      const otherPg = await seedPgWorkspace(ctx.db, '이니시스');
      const otherCodes = (await repo.findOpenRfpsForPg(otherPg.id, new Date())).map((r) => r.rfpCode);
      expect(otherCodes).toContain('P-2605-2000');
    });

    it('excludes RFPs with an existing request regardless of its status (pending/accepted/rejected)', async () => {
      const pendingRfp = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-3000' });
      const acceptedRfp = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-3001' });
      const rejectedRfp = await insertRfp(ctx.db, { buyerWsId: ctx.ws.id, createdBy: ctx.buyer.id, code: 'P-2605-3002' });
      await repo.create(makeRequest(pendingRfp, ctx.pgWs.id, ctx.pgUser.id));
      await repo.create(makeRequest(acceptedRfp, ctx.pgWs.id, ctx.pgUser.id, { status: 'accepted' }));
      await repo.create(makeRequest(rejectedRfp, ctx.pgWs.id, ctx.pgUser.id, { status: 'rejected' }));

      const codes = (await repo.findOpenRfpsForPg(ctx.pgWs.id, new Date())).map((r) => r.rfpCode);
      expect(codes).not.toContain('P-2605-3000');
      expect(codes).not.toContain('P-2605-3001');
      expect(codes).not.toContain('P-2605-3002');
    });

    it('listing exposes the whitelist (incl. deadline·payment·products) and NEVER leaks sealed fee/terms', async () => {
      await insertRfp(ctx.db, {
        buyerWsId: ctx.ws.id,
        createdBy: ctx.buyer.id,
        code: 'P-2605-4000',
        title: '카드 결제 PG 견적',
        websiteUrl: 'https://shop.example.com',
        mainProducts: '전자책 구독',
        requiredPaymentMethods: ['card', 'kakao_pay'],
        customPaymentMethods: [{ id: 'c1', label: '포인트결제' }],
      });
      const [listing] = await repo.findOpenRfpsForPg(ctx.pgWs.id, new Date());
      expect(listing).toBeDefined();
      // 정확한 화이트리스트 — 키 하나라도 늘면(봉인 필드가 새면) 여기서 깨진다.
      expect(Object.keys(listing).sort()).toEqual([
        'buyerName',
        'contractType',
        'customPaymentMethodLabels',
        'deadline',
        'mainProducts',
        'requiredPaymentMethods',
        'rfpCode',
        'title',
        'websiteUrl',
      ]);
      expect(listing.rfpCode).toBe('P-2605-4000');
      expect(listing.buyerName).toBe('구매사ABC');
      expect(listing.title).toBe('카드 결제 PG 견적');
      expect(listing.websiteUrl).toBe('https://shop.example.com');
      expect(listing.mainProducts).toBe('전자책 구독');
      expect(listing.requiredPaymentMethods).toEqual(['card', 'kakao_pay']);
      expect(listing.customPaymentMethodLabels).toEqual(['포인트결제']);
      // deadline 은 직렬화된 ISO 문자열.
      expect(typeof listing.deadline).toBe('string');
      expect(Number.isNaN(Date.parse(listing.deadline))).toBe(false);
      // 봉인 경계 — 경쟁정보는 절대 포함 안 됨(명시 가드).
      const sealed = listing as Record<string, unknown>;
      expect(sealed.currentFeeRate).toBeUndefined();
      expect(sealed.annualPgVolume).toBeUndefined();
      expect(sealed.currentSettlementLimit).toBeUndefined();
      expect(sealed.currentGuaranteeInsurance).toBeUndefined();
      expect(sealed.memo).toBeUndefined();
      expect(sealed.bizProfileId).toBeUndefined();
      // 견적 확장: 버전드 문서·숨김목록도 절대 노출 금지(봉인 경계 핵심 가드).
      expect(sealed.currentTerms).toBeUndefined();
      expect(sealed.hiddenFromPg).toBeUndefined();
    });
  });
});

// Reference schema import so unused-var lint stays quiet if a test path skips it.
void eq;
void rfpPgRequests;
