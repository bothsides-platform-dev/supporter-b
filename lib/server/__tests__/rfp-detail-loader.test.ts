// rfp-detail-loader — 구매사/PG 상세 페이지·모달이 공유하는 auth-free 로더.
//   - loadBuyerRfpDetail: 소유 가드(null) + submitted bid만 + note Date→ISO 직렬화.
//   - loadPgRfpDetail: canAccess 가드(null) + markOpened 부수효과(accepted→opened, 멱등) + myBid.
// 컨벤션: buyer-kanban-loader.test.ts 와 동일 — pglite + seed, auth mock 없음.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { bids, bidNotes, rfpInvitations, rfpPgRequests, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getBidQuoteTemplateRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import {
  loadBuyerRfpDetail,
  loadPgRfpDetail,
} from '../rfp-detail-loader';

let ctx: Awaited<ReturnType<typeof setup>>;

async function setup() {
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);

  const buyer = await seedUser(db, { email: 'buyer@buy.com', name: '구매 담당자' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사', bizProfileId: biz.id });
  const otherWs = await seedBuyerWorkspace(db, { name: '남의구매사' });
  const toss = await seedPgWorkspace(db, 'toss.im');
  const inicis = await seedPgWorkspace(db, 'inicis.com');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  async function seedRfp(code: string) {
    const id = randomUUID();
    await db.insert(rfps).values({
      id,
      code,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: code,
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
    return id;
  }
  async function seedInvitation(
    rfpId: string,
    pgWsId: string,
    status: 'pending' | 'accepted' | 'opened' = 'accepted',
  ) {
    const id = randomUUID();
    await db.insert(rfpInvitations).values({
      id,
      rfpId,
      pgWsId,
      acceptedByUserId: pgUser.id,
      tokenHash: hashToken(generateToken()),
      sentAt: new Date(),
      expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
      status,
    });
    return id;
  }
  async function seedBid(
    rfpId: string,
    pgWsId: string,
    invitationId: string,
    status: 'submitted' | 'draft' = 'submitted',
    round = 1,
  ) {
    const id = randomUUID();
    await db.insert(bids).values({
      id,
      rfpId,
      pgWsId,
      invitationId,
      round,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status,
      submittedBy: pgUser.id,
    });
    return id;
  }
  async function seedNote(bidId: string, body: string) {
    const id = randomUUID();
    await db.insert(bidNotes).values({ id, bidId, authorId: buyer.id, body });
    return id;
  }
  async function seedPgRequest(
    rfpId: string,
    pgWsId: string,
    message: string,
    status: 'pending' | 'accepted' | 'rejected' = 'pending',
  ) {
    const id = randomUUID();
    await db.insert(rfpPgRequests).values({
      id,
      rfpId,
      pgWsId,
      message,
      status,
      createdByUserId: pgUser.id,
    });
    return id;
  }

  return {
    db,
    buyerWsId: buyerWs.id,
    otherWsId: otherWs.id,
    tossId: toss.id,
    inicisId: inicis.id,
    buyerId: buyer.id,
    buyerName: buyer.name,
    seedRfp,
    seedInvitation,
    seedBid,
    seedNote,
    seedPgRequest,
  };
}

beforeEach(async () => {
  __resetForTest();
  ctx = await setup();
});

afterEach(() => {
  __resetForTest();
});

describe('loadBuyerRfpDetail', () => {
  it('존재하지 않는 code → null', async () => {
    const res = await loadBuyerRfpDetail({
      code: 'P-9999-9999',
      workspaceId: ctx.buyerWsId,
      userId: ctx.buyerId,
      userName: ctx.buyerName,
    });
    expect(res).toBeNull();
  });

  it('다른 워크스페이스 소유 RFP → null', async () => {
    await ctx.seedRfp('P-2605-0001');
    const res = await loadBuyerRfpDetail({
      code: 'P-2605-0001',
      workspaceId: ctx.otherWsId,
      userId: ctx.buyerId,
      userName: ctx.buyerName,
    });
    expect(res).toBeNull();
  });

  it('소유 RFP → submitted bid만 반환', async () => {
    const rfpId = await ctx.seedRfp('P-2605-0002');
    const invToss = await ctx.seedInvitation(rfpId, ctx.tossId);
    const invInicis = await ctx.seedInvitation(rfpId, ctx.inicisId);
    const submitted = await ctx.seedBid(rfpId, ctx.tossId, invToss, 'submitted');
    await ctx.seedBid(rfpId, ctx.inicisId, invInicis, 'draft');

    const res = await loadBuyerRfpDetail({
      code: 'P-2605-0002',
      workspaceId: ctx.buyerWsId,
      userId: ctx.buyerId,
      userName: ctx.buyerName,
    });

    expect(res).not.toBeNull();
    expect(res!.rfp.code).toBe('P-2605-0002');
    // draft 제외, submitted 1건만.
    expect(res!.bids).toHaveLength(1);
    expect(res!.bids[0].id).toBe(submitted);
    expect(res!.authorId).toBe(ctx.buyerId);
  });

  it('multi-round: PG별 최신 라운드 bid만 반환하고 requoteByPg·priorBidByPg를 노출', async () => {
    const rfpId = await ctx.seedRfp('P-2606-0030');
    const inv = await ctx.seedInvitation(rfpId, ctx.tossId, 'accepted');
    // round 1 + round 2 제출.
    await ctx.seedBid(rfpId, ctx.tossId, inv, 'submitted', 1);
    const bid2Id = await ctx.seedBid(rfpId, ctx.tossId, inv, 'submitted', 2);
    // requote 레코드 (round 2, responded).
    await ctx.db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId,
      pgWsId: ctx.tossId,
      round: 2,
      message: '낮춰주세요',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'responded',
      createdByUserId: ctx.buyerId,
      createdAt: new Date(),
      respondedAt: new Date(),
    });

    const res = await loadBuyerRfpDetail({
      code: 'P-2606-0030',
      workspaceId: ctx.buyerWsId,
      userId: ctx.buyerId,
      userName: ctx.buyerName,
    });

    expect(res).not.toBeNull();
    // bids 는 최신 라운드 1건만.
    const forToss = res!.bids.filter((b) => b.pgWsId === ctx.tossId);
    expect(forToss).toHaveLength(1);
    expect(forToss[0]!.id).toBe(bid2Id);
    expect(forToss[0]!.round).toBe(2);
    // requoteByPg.
    expect(res!.requoteByPg[ctx.tossId]?.status).toBe('responded');
    expect(res!.requoteByPg[ctx.tossId]?.round).toBe(2);
    // priorBidByPg — round 1이 직전.
    expect(res!.priorBidByPg[ctx.tossId]).toBeDefined();
    expect(res!.priorBidByPg[ctx.tossId]!.round).toBe(1);
  });

  it('pendingRequests에 pending 콜드 피치만 PG명+메시지와 함께 반환', async () => {
    const rfpId = await ctx.seedRfp('P-2605-0003');
    await ctx.seedPgRequest(rfpId, ctx.tossId, '제안 드리고 싶어요', 'pending');
    await ctx.seedPgRequest(rfpId, ctx.inicisId, '이미 거절됨', 'rejected');

    const res = await loadBuyerRfpDetail({
      code: 'P-2605-0003',
      workspaceId: ctx.buyerWsId,
      userId: ctx.buyerId,
      userName: ctx.buyerName,
    });

    expect(res).not.toBeNull();
    expect(res!.pendingRequests).toHaveLength(1);
    const req = res!.pendingRequests[0];
    expect(req.pgWsId).toBe(ctx.tossId);
    expect(req.pgWsName).toBe('toss.im');
    expect(req.message).toBe('제안 드리고 싶어요');
    expect(typeof req.id).toBe('string');
  });
});

describe('loadPgRfpDetail', () => {
  it('초대받지 않은 PG → null', async () => {
    await ctx.seedRfp('P-2605-0010');
    const res = await loadPgRfpDetail({
      code: 'P-2605-0010',
      workspaceId: ctx.tossId,
    });
    expect(res).toBeNull();
  });

  it('초대된 PG → accepted invitation을 opened로 전이(markOpened)하고 멱등', async () => {
    const rfpId = await ctx.seedRfp('P-2605-0011');
    await ctx.seedInvitation(rfpId, ctx.tossId, 'accepted');

    const res = await loadPgRfpDetail({ code: 'P-2605-0011', workspaceId: ctx.tossId });
    expect(res).not.toBeNull();
    expect(res!.myBid).toBeUndefined();

    const invRepo = await getInvitationRepo();
    const after = (await invRepo.findByRfp(rfpId)).find((i) => i.pgWsId === ctx.tossId)!;
    expect(after.status).toBe('opened');

    // 두 번째 진입은 멱등 — 여전히 opened, throw 없음.
    const res2 = await loadPgRfpDetail({ code: 'P-2605-0011', workspaceId: ctx.tossId });
    expect(res2).not.toBeNull();
    const after2 = (await invRepo.findByRfp(rfpId)).find((i) => i.pgWsId === ctx.tossId)!;
    expect(after2.status).toBe('opened');
  });

  it('이미 제출한 bid가 있으면 myBid 반환', async () => {
    const rfpId = await ctx.seedRfp('P-2605-0012');
    const inv = await ctx.seedInvitation(rfpId, ctx.tossId, 'accepted');
    const bidId = await ctx.seedBid(rfpId, ctx.tossId, inv, 'submitted');

    const res = await loadPgRfpDetail({ code: 'P-2605-0012', workspaceId: ctx.tossId });
    expect(res).not.toBeNull();
    expect(res!.myBid?.id).toBe(bidId);
  });

  it('buyerName에 구매사 워크스페이스 name을 반환', async () => {
    const rfpId = await ctx.seedRfp('P-2605-0013');
    await ctx.seedInvitation(rfpId, ctx.tossId, 'accepted');

    const res = await loadPgRfpDetail({ code: 'P-2605-0013', workspaceId: ctx.tossId });
    expect(res).not.toBeNull();
    expect(res!.buyerName).toBe('구매사');
  });

  it('pending 재요청이 있으면 pendingRequote 반환; 없으면 null', async () => {
    const rfpId = await ctx.seedRfp('P-2606-0050');
    const inv = await ctx.seedInvitation(rfpId, ctx.tossId, 'accepted');
    await ctx.seedBid(rfpId, ctx.tossId, inv, 'submitted', 1);
    await ctx.db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId,
      pgWsId: ctx.tossId,
      round: 2,
      message: '수수료 낮춰주세요',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'pending',
      createdByUserId: ctx.buyerId,
      createdAt: new Date(),
    });

    const res = await loadPgRfpDetail({ code: 'P-2606-0050', workspaceId: ctx.tossId });
    expect(res).not.toBeNull();
    expect(res!.pendingRequote).not.toBeNull();
    expect(res!.pendingRequote!.round).toBe(2);
    expect(res!.pendingRequote!.message).toBe('수수료 낮춰주세요');
  });

  it('해당 PG 워크스페이스의 견적 템플릿만 quoteTemplates로 반환(타 워크스페이스 격리)', async () => {
    const rfpId = await ctx.seedRfp('P-2605-0014');
    await ctx.seedInvitation(rfpId, ctx.tossId, 'accepted');

    const repo = await getBidQuoteTemplateRepo();
    await repo.create({
      pgWsId: ctx.tossId,
      name: '표준 요율',
      settleCycle: 'M+1',
      settleLimit: 5_000_000,
      guaranteeInsurance: 0,
      paymentFees: { card: 0.0125 },
      createdBy: ctx.buyerId,
    });
    await repo.create({
      pgWsId: ctx.inicisId,
      name: '남의 요율',
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: {},
      createdBy: ctx.buyerId,
    });

    const res = await loadPgRfpDetail({ code: 'P-2605-0014', workspaceId: ctx.tossId });
    expect(res).not.toBeNull();
    expect(res!.quoteTemplates).toEqual([
      {
        id: expect.any(String),
        name: '표준 요율',
        settleCycle: 'M+1',
        settleLimit: 5_000_000,
        guaranteeInsurance: 0,
        paymentFees: { card: 0.0125 },
      },
    ]);
  });
});
