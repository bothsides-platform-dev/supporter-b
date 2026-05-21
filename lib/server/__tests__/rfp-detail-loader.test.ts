// rfp-detail-loader — 구매사/PG 상세 페이지·모달이 공유하는 auth-free 로더.
//   - loadBuyerRfpDetail: 소유 가드(null) + submitted bid만 + note Date→ISO 직렬화.
//   - loadPgRfpDetail: canAccess 가드(null) + markOpened 부수효과(accepted→opened, 멱등) + myBid.
// 컨벤션: buyer-kanban-loader.test.ts 와 동일 — pglite + seed, auth mock 없음.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { bids, bidNotes, rfpInvitations, rfps } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { loadBuyerRfpDetail, loadPgRfpDetail } from '../rfp-detail-loader';

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
  ) {
    const id = randomUUID();
    await db.insert(bids).values({
      id,
      rfpId,
      pgWsId,
      invitationId,
      settleCycle: 'D+1',
      deposit: '0',
      setupFee: '0',
      monthlyMin: '0',
      bankTransferFeePct: '0.015',
      easyPayFeePct: '0.018',
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

  return {
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

  it('소유 RFP → submitted bid만 반환하고 note를 ISO 문자열로 직렬화', async () => {
    const rfpId = await ctx.seedRfp('P-2605-0002');
    const invToss = await ctx.seedInvitation(rfpId, ctx.tossId);
    const invInicis = await ctx.seedInvitation(rfpId, ctx.inicisId);
    const submitted = await ctx.seedBid(rfpId, ctx.tossId, invToss, 'submitted');
    await ctx.seedBid(rfpId, ctx.inicisId, invInicis, 'draft');
    await ctx.seedNote(submitted, '괜찮은 제안');

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
    // note 가 ISO 문자열로 직렬화돼 클라이언트 트리에 안전.
    const notes = res!.notesByBid[submitted];
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe('괜찮은 제안');
    expect(typeof notes[0].createdAt).toBe('string');
    // 작성자 정보가 BidComparisonView 로 전달되도록 채워짐.
    expect(res!.authorId).toBe(ctx.buyerId);
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
});
