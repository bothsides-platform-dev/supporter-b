// DrizzleBidRepository — proposalPdfs(N개) url 계약 검증.
// 첨부가 달린 bid는 findById/findByRfp/findByPgWs 어느 경로로 조회하든
// proposalPdfs[i].url === `/api/files/{attachmentId}` 여야 한다.
// 첨부가 없는 bid는 빈 배열.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { attachments, bids, pgSigningTemplates, rfpInvitations, rfps } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleBidRepository } from '../bid';
import { DrizzlePgSigningTemplateRepository } from '../pg-signing-template';
import { generateToken, hashToken, addMinutes } from '../../../token';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db, { email: 'buyer@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-0042',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'bid repo test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });

  const invitationId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invitationId,
    rfpId,
    pgWsId: pgWs.id,
    acceptedByUserId: pgUser.id,
    tokenHash: hashToken(generateToken()),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });

  const repo = new DrizzleBidRepository(db);
  return { db, repo, rfpId, pgWs, pgUser, invitationId, buyer, buyerWs, biz };
}

async function insertBid(
  db: PgliteDB,
  ctx: Awaited<ReturnType<typeof setup>>,
  proposalCount = 1,
) {
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId: ctx.rfpId,
    pgWsId: ctx.pgWs.id,
    invitationId: ctx.invitationId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    submittedBy: ctx.pgUser.id,
  });

  const attachmentIds: string[] = [];
  for (let i = 0; i < proposalCount; i++) {
    const id = randomUUID();
    attachmentIds.push(id);
    await db.insert(attachments).values({
      id,
      bidId,
      name: `proposal-${i}.pdf`,
      size: 2048,
      mimeType: 'application/pdf',
      uploadedBy: ctx.pgUser.id,
    });
  }

  return { bidId, attachmentIds };
}

describe('DrizzleBidRepository — proposalPdfs url 계약', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('findById: 첨부 달린 bid는 proposalPdfs[0].url 이 /api/files/{attId}', async () => {
    const { bidId, attachmentIds } = await insertBid(ctx.db, ctx);

    const bid = await ctx.repo.findById(bidId);

    expect(bid).toBeDefined();
    expect(bid!.proposalPdfs).toHaveLength(1);
    expect(bid!.proposalPdfs[0].id).toBe(attachmentIds[0]);
    expect(bid!.proposalPdfs[0].url).toBe(`/api/files/${attachmentIds[0]}`);
    expect(bid!.proposalPdfs[0].name).toBe('proposal-0.pdf');
  });

  it('bid당 여러 제안서 첨부를 모두 노출한다', async () => {
    const { bidId, attachmentIds } = await insertBid(ctx.db, ctx, 3);

    const bid = await ctx.repo.findById(bidId);

    expect(bid!.proposalPdfs).toHaveLength(3);
    expect(bid!.proposalPdfs.map((p) => p.id).sort()).toEqual([...attachmentIds].sort());
  });

  it('findByRfp: 첨부 url 노출 + uuid rfpId 매칭', async () => {
    const { attachmentIds } = await insertBid(ctx.db, ctx);

    const list = await ctx.repo.findByRfp(ctx.rfpId);

    expect(list).toHaveLength(1);
    expect(list[0].proposalPdfs[0].url).toBe(`/api/files/${attachmentIds[0]}`);
  });

  it('첨부 없는 bid 는 빈 배열', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);

    const bid = await ctx.repo.findById(bidId);

    expect(bid).toBeDefined();
    expect(bid!.proposalPdfs).toEqual([]);
  });

  it('status=pending 인 첨부(검증 전)는 proposalPdfs 에서 제외한다', async () => {
    const { bidId, attachmentIds } = await insertBid(ctx.db, ctx, 1);
    const pendingId = randomUUID();
    await ctx.db.insert(attachments).values({
      id: pendingId,
      bidId,
      name: 'unverified.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      uploadedBy: ctx.pgUser.id,
      status: 'pending',
    });

    const bid = await ctx.repo.findById(bidId);

    expect(bid!.proposalPdfs.map((p) => p.id)).toEqual(attachmentIds);
  });
});

describe('DrizzleBidRepository — 전체 필드 라운드트립 (명시적 projection 회귀 방지)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  // rowToBid 가 소비하는 모든 컬럼이 findById projection 으로 누락 없이
  // 읽혀야 한다. 명시적 select({...}) 로 전환할 때 컬럼 하나라도 빠지면
  // 이 테스트가 빨갛게 떨어진다.
  it('findById 가 모든 스칼라 필드를 누락 없이 반환한다', async () => {
    const bidId = randomUUID();
    await ctx.db.insert(bids).values({
      id: bidId,
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'W+2',
      settleLimit: '15000.50',
      guaranteeInsurance: '300000.00',
      paymentFees: { card: 0.0125, bank_transfer: 0.005 },
      memo: 'round trip memo',
      status: 'submitted',
      submittedBy: ctx.pgUser.id,
      submittedAt: new Date('2026-01-15T08:30:00.000Z'),
    });

    const bid = await ctx.repo.findById(bidId);

    expect(bid).toBeDefined();
    expect(bid!.id).toBe(bidId);
    expect(bid!.rfpId).toBe(ctx.rfpId);
    expect(bid!.pgWsId).toBe(ctx.pgWs.id);
    expect(bid!.invitationId).toBe(ctx.invitationId);
    expect(bid!.settleCycle).toBe('W+2');
    expect(bid!.settleLimit).toBe(15000.5);
    expect(bid!.guaranteeInsurance).toBe(300000);
    expect(bid!.paymentFees).toEqual({ card: 0.0125, bank_transfer: 0.005 });
    expect(bid!.memo).toBe('round trip memo');
    expect(bid!.status).toBe('submitted');
    expect(bid!.submittedBy).toBe(ctx.pgUser.id);
    expect(bid!.submittedAt).toBe('2026-01-15T08:30:00.000Z');
    expect(bid!.boardColumnId).toBeNull();
  });

  it('customFees JSONB 를 누락 없이 라운드트립한다', async () => {
    const bidId = randomUUID();
    await ctx.db.insert(bids).values({
      id: bidId,
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      customFees: { 'custom-1': 0.02, 'custom-2': 0.018 },
      submittedBy: ctx.pgUser.id,
    });

    const bid = await ctx.repo.findById(bidId);

    expect(bid).toBeDefined();
    expect(bid!.customFees).toEqual({ 'custom-1': 0.02, 'custom-2': 0.018 });
  });

  it('customFees 미설정 시 빈 객체', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);

    const bid = await ctx.repo.findById(bidId);

    expect(bid!.customFees).toEqual({});
  });
});

describe('DrizzleBidRepository.findByRfpIds — 배치 조회 (N+1 제거)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  // 두 번째 RFP(같은 buyer ws) + invitation + bid 1개(첨부 1개) 생성.
  async function secondRfpWithBid() {
    const rfp2 = randomUUID();
    await ctx.db.insert(rfps).values({
      id: rfp2,
      code: 'P-2605-0043',
      buyerWsId: ctx.buyerWs.id,
      bizProfileId: ctx.biz.id,
      title: 'rfp2',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: ctx.buyer.id,
      sentAt: new Date(),
    });
    const inv2 = randomUUID();
    await ctx.db.insert(rfpInvitations).values({
      id: inv2,
      rfpId: rfp2,
      pgWsId: ctx.pgWs.id,
      acceptedByUserId: ctx.pgUser.id,
      tokenHash: hashToken(generateToken()),
      sentAt: new Date(),
      expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
      status: 'accepted',
    });
    const bidId = randomUUID();
    await ctx.db.insert(bids).values({
      id: bidId,
      rfpId: rfp2,
      pgWsId: ctx.pgWs.id,
      invitationId: inv2,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      submittedBy: ctx.pgUser.id,
    });
    const attId = randomUUID();
    await ctx.db.insert(attachments).values({
      id: attId,
      bidId,
      name: 'r2.pdf',
      size: 1,
      mimeType: 'application/pdf',
      uploadedBy: ctx.pgUser.id,
    });
    return { rfp2, bidId, attId };
  }

  it('여러 RFP의 bid를 rfpId별 Map으로 그룹화 + 제안서 하이드레이션', async () => {
    await insertBid(ctx.db, ctx, 2); // rfp1: bid 1개, 제안서 2개
    const { rfp2, attId } = await secondRfpWithBid(); // rfp2: bid 1개, 제안서 1개

    const map = await ctx.repo.findByRfpIds([ctx.rfpId, rfp2]);

    expect(map.get(ctx.rfpId)).toHaveLength(1);
    expect(map.get(ctx.rfpId)![0].rfpId).toBe(ctx.rfpId);
    expect(map.get(ctx.rfpId)![0].proposalPdfs).toHaveLength(2);

    expect(map.get(rfp2)).toHaveLength(1);
    expect(map.get(rfp2)![0].rfpId).toBe(rfp2);
    expect(map.get(rfp2)![0].proposalPdfs.map((p) => p.id)).toEqual([attId]);
  });

  it('bid 없는 RFP는 Map에 키 없음', async () => {
    const map = await ctx.repo.findByRfpIds([ctx.rfpId]);
    expect(map.has(ctx.rfpId)).toBe(false);
  });

  it('빈 입력 → 빈 Map (쿼리 없이)', async () => {
    const map = await ctx.repo.findByRfpIds([]);
    expect(map.size).toBe(0);
  });
});

// ─── Task 1: round 컬럼 영속 검증 ────────────────────────────────────────────

async function seedInvited(db: PgliteDB, buyerWsId: string, createdBy: string, pgWsId: string) {
  const { id: rfpId, code } = await seedRfp(db, { buyerWsId, createdBy });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    status: 'accepted',
  });
  return { rfpId, code, invId };
}

describe('DrizzleBidRepository round', () => {
  it('persists round and exposes it via findByRfp; allows two rounds for one PG', async () => {
    const db = await createPgliteDb();
    const repo = new DrizzleBidRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const { rfpId, invId } = await seedInvited(db, buyerWs.id, buyer.id, pgWs.id);

    const base = {
      rfpId,
      pgWsId: pgWs.id,
      invitationId: invId,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      signupFee: 0,
      paymentFees: {},
      customFees: {},
      proposalPdfs: [],
      status: 'submitted' as const,
      submittedBy: buyer.id,
      submittedAt: new Date().toISOString(),
    };
    await repo.save({ id: randomUUID(), round: 1, ...base });
    await repo.save({ id: randomUUID(), round: 2, ...base });

    const rows = await repo.findByRfp(rfpId);
    expect(rows.map((b) => b.round).sort()).toEqual([1, 2]);
  });

  it('findByPgWs 는 round 오름차순으로 반환한다 (최신 라운드가 Map last-write-wins 로 보존됨)', async () => {
    const db = await createPgliteDb();
    const repo = new DrizzleBidRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg2.io');
    const { rfpId, invId } = await seedInvited(db, buyerWs.id, buyer.id, pgWs.id);

    const base = {
      rfpId,
      pgWsId: pgWs.id,
      invitationId: invId,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      signupFee: 0,
      paymentFees: {},
      customFees: {},
      proposalPdfs: [],
      status: 'submitted' as const,
      submittedBy: buyer.id,
      submittedAt: new Date().toISOString(),
    };
    // round 2 를 먼저 INSERT — ORDER BY 없으면 삽입 순서(2,1)로 반환될 수 있음
    await repo.save({ id: randomUUID(), round: 2, ...base });
    await repo.save({ id: randomUUID(), round: 1, ...base });

    const rows = await repo.findByPgWs(pgWs.id);
    expect(rows.map((b) => b.round)).toEqual([1, 2]);
  });
});

describe('DrizzleBidRepository signupFee', () => {
  it('round-trips signupFee', async () => {
    const db = await createPgliteDb();
    const repo = new DrizzleBidRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'pg3.io');
    const { rfpId, invId } = await seedInvited(db, buyerWs.id, buyer.id, pgWs.id);

    const bidId = randomUUID();
    await repo.save({
      id: bidId,
      rfpId,
      pgWsId: pgWs.id,
      invitationId: invId,
      round: 1,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      signupFee: 550000,
      paymentFees: {},
      customFees: {},
      proposalPdfs: [],
      status: 'submitted',
      submittedBy: buyer.id,
      submittedAt: new Date().toISOString(),
    });

    const bid = await repo.findById(bidId);
    expect(bid!.signupFee).toBe(550000);
  });
});

// ─── Phase 2C gap methods ─────────────────────────────────────────────────

describe('DrizzleBidRepository.updateStatus', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('transitions a submitted bid to withdrawn', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);
    expect((await ctx.repo.findById(bidId))!.status).toBe('submitted');
    await ctx.repo.updateStatus(bidId, 'withdrawn');
    expect((await ctx.repo.findById(bidId))!.status).toBe('withdrawn');
  });
});

describe('DrizzleBidRepository.searchForBuyer', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns bids⋈rfps⋈workspaces projection for submitted bids matching ilike', async () => {
    const bidId = randomUUID();
    await ctx.db.insert(bids).values({
      id: bidId,
      rfpId: ctx.rfpId, // code P-2605-0042, title 'bid repo test'
      pgWsId: ctx.pgWs.id, // name 'toss.im'
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: 'buyer needle',
      status: 'submitted',
      submittedBy: ctx.pgUser.id,
    });

    const rows = (await ctx.repo.searchForBuyer(ctx.buyerWs.id, '%needle%')) as {
      bidId: string;
      rfpId: string;
      rfpTitle: string;
      pgWsName: string;
      memo: string;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      bidId,
      rfpId: 'P-2605-0042', // rfps.code, not uuid
      rfpTitle: 'bid repo test',
      pgWsName: 'toss.im',
      memo: 'buyer needle',
    });
  });

  it('excludes non-submitted bids and other workspaces', async () => {
    // withdrawn — excluded
    await ctx.db.insert(bids).values({
      id: randomUUID(),
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: 'needle wd',
      status: 'withdrawn',
      submittedBy: ctx.pgUser.id,
    });
    const rows = (await ctx.repo.searchForBuyer(ctx.buyerWs.id, '%needle%')) as unknown[];
    expect(rows).toHaveLength(0);
    // unrelated buyer ws — no rows
    const otherRows = (await ctx.repo.searchForBuyer(randomUUID(), '%bid repo%')) as unknown[];
    expect(otherRows).toHaveLength(0);
  });
});

describe('DrizzleBidRepository.searchForPg', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns bids⋈rfps projection (no pgWsName) for the PG ws, submitted only', async () => {
    const bidId = randomUUID();
    await ctx.db.insert(bids).values({
      id: bidId,
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: 'pg needle',
      status: 'submitted',
      submittedBy: ctx.pgUser.id,
    });

    const rows = (await ctx.repo.searchForPg(ctx.pgWs.id, '%needle%')) as {
      bidId: string;
      rfpId: string;
      rfpTitle: string;
      memo: string;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      bidId,
      rfpId: 'P-2605-0042',
      rfpTitle: 'bid repo test',
      memo: 'pg needle',
    });
    // projection has no pgWsName key
    expect('pgWsName' in rows[0]).toBe(false);
  });

  it('matches on rfp title and excludes other PG ws', async () => {
    await ctx.db.insert(bids).values({
      id: randomUUID(),
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: '',
      status: 'submitted',
      submittedBy: ctx.pgUser.id,
    });
    const byTitle = (await ctx.repo.searchForPg(ctx.pgWs.id, '%bid repo%')) as unknown[];
    expect(byTitle).toHaveLength(1);
    const otherPg = (await ctx.repo.searchForPg(randomUUID(), '%bid repo%')) as unknown[];
    expect(otherPg).toHaveLength(0);
  });
});

describe('DrizzleBidRepository.listForBuyer', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns the same projection as searchForBuyer, submitted+ws-scoped, no ilike, capped by limit', async () => {
    const bidId = randomUUID();
    await ctx.db.insert(bids).values({
      id: bidId,
      rfpId: ctx.rfpId, // code P-2605-0042, title 'bid repo test'
      pgWsId: ctx.pgWs.id, // name 'toss.im'
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: 'no-match-text',
      status: 'submitted',
      submittedBy: ctx.pgUser.id,
    });

    const rows = (await ctx.repo.listForBuyer(ctx.buyerWs.id, 10)) as {
      bidId: string;
      rfpId: string;
      rfpTitle: string;
      pgWsName: string;
      memo: string;
    }[];

    // no ilike — row returned despite memo not matching any pattern
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(['bidId', 'memo', 'pgWsName', 'rfpId', 'rfpTitle']);
    expect(rows[0]).toEqual({
      bidId,
      rfpId: 'P-2605-0042',
      rfpTitle: 'bid repo test',
      pgWsName: 'toss.im',
      memo: 'no-match-text',
    });
  });

  it('excludes non-submitted bids and other workspaces, respects limit', async () => {
    // withdrawn — excluded
    await ctx.db.insert(bids).values({
      id: randomUUID(),
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: '',
      status: 'withdrawn',
      submittedBy: ctx.pgUser.id,
    });
    const rows = (await ctx.repo.listForBuyer(ctx.buyerWs.id, 10)) as unknown[];
    expect(rows).toHaveLength(0);
    const otherRows = (await ctx.repo.listForBuyer(randomUUID(), 10)) as unknown[];
    expect(otherRows).toHaveLength(0);
  });
});

describe('DrizzleBidRepository.listForPg', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns the same projection as searchForPg (no pgWsName), submitted+pg-scoped, no ilike, capped by limit', async () => {
    const bidId = randomUUID();
    await ctx.db.insert(bids).values({
      id: bidId,
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: 'no-match-text',
      status: 'submitted',
      submittedBy: ctx.pgUser.id,
    });

    const rows = (await ctx.repo.listForPg(ctx.pgWs.id, 10)) as {
      bidId: string;
      rfpId: string;
      rfpTitle: string;
      memo: string;
    }[];

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(['bidId', 'memo', 'rfpId', 'rfpTitle']);
    expect(rows[0]).toEqual({
      bidId,
      rfpId: 'P-2605-0042',
      rfpTitle: 'bid repo test',
      memo: 'no-match-text',
    });
    expect('pgWsName' in rows[0]).toBe(false);
  });

  it('excludes non-submitted bids and other PG workspaces', async () => {
    await ctx.db.insert(bids).values({
      id: randomUUID(),
      rfpId: ctx.rfpId,
      pgWsId: ctx.pgWs.id,
      invitationId: ctx.invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      memo: '',
      status: 'withdrawn',
      submittedBy: ctx.pgUser.id,
    });
    const rows = (await ctx.repo.listForPg(ctx.pgWs.id, 10)) as unknown[];
    expect(rows).toHaveLength(0);
    const otherPg = (await ctx.repo.listForPg(randomUUID(), 10)) as unknown[];
    expect(otherPg).toHaveLength(0);
  });
});

describe('DrizzleBidRepository.findRfpOwner', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns rfpId + owning buyer ws for a known bid', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);
    expect(await ctx.repo.findRfpOwner(bidId)).toEqual({
      rfpId: ctx.rfpId,
      buyerWsId: ctx.buyerWs.id,
    });
  });

  it('returns undefined for an unknown bid', async () => {
    expect(await ctx.repo.findRfpOwner(randomUUID())).toBeUndefined();
  });
});

describe('DrizzleBidRepository.findSigningTemplateId — 봉인 경계', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  async function linkTemplate(bidId: string): Promise<string> {
    const templateId = randomUUID();
    await ctx.db.insert(pgSigningTemplates).values({
      id: templateId,
      workspaceId: ctx.pgWs.id,
      snowsignTemplateId: 'sst-1',
      name: '표준 가맹 계약서',
      createdBy: ctx.pgUser.id,
    });
    await ctx.db
      .update(bids)
      .set({ signingTemplateId: templateId })
      .where(eq(bids.id, bidId));
    return templateId;
  }

  it('reads the linked template id through the narrow path', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);
    const templateId = await linkTemplate(bidId);
    expect(await ctx.repo.findSigningTemplateId(bidId)).toBe(templateId);
  });

  it('returns undefined when nothing is linked, and for an unknown bid', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);
    expect(await ctx.repo.findSigningTemplateId(bidId)).toBeUndefined();
    expect(await ctx.repo.findSigningTemplateId(randomUUID())).toBeUndefined();
  });

  // 봉인 경계 드리프트 가드. `signingTemplateId` 가 `Bid` 도메인 객체에 실리면
  // `BuyerRfpDetailData.bids: Bid[]`(rfp-detail-loader)를 타고 구매사 비교표까지
  // 그대로 흘러가, PG 가 어떤 계약서를 골랐는지가 노출된다.
  //
  // 단언 대상이 `BID_COLUMNS` 가 아니라 **`rowToBid` 의 반환 객체**인 것이 핵심이다 —
  // 실제 게이트가 거기다. `BID_COLUMNS` 에만 추가해도 이 테스트는 통과한다(리터럴을
  // 반환하므로). 이 함정은 실제로 한 번 밟았던 것이라 명시해 둔다.
  it('never leaks signingTemplateId onto the Bid domain object', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);
    await linkTemplate(bidId);

    const byId = await ctx.repo.findById(bidId);
    expect(byId).toBeDefined();
    expect(byId).not.toHaveProperty('signingTemplateId');

    for (const bid of await ctx.repo.findByRfp(ctx.rfpId)) {
      expect(bid).not.toHaveProperty('signingTemplateId');
    }
    for (const bid of await ctx.repo.findByPgWs(ctx.pgWs.id)) {
      expect(bid).not.toHaveProperty('signingTemplateId');
    }
  });
});

describe('DrizzleBidRepository.save — signingTemplateId (쓰기 전용)', () => {
  it('save() persists signingTemplateId and findSigningTemplateId() reads it back — Bid 타입엔 여전히 미노출', async () => {
    const { db, repo, rfpId, pgWs, pgUser, invitationId } = await setup();

    const templateRepo = new DrizzlePgSigningTemplateRepository(db);
    const templateId = randomUUID();
    await templateRepo.create({
      id: templateId,
      workspaceId: pgWs.id,
      snowsignTemplateId: 'sst-save-1',
      name: '표준 가맹 계약서',
      createdBy: pgUser.id,
    });

    const bidId = randomUUID();
    await repo.save({
      id: bidId,
      rfpId,
      pgWsId: pgWs.id,
      invitationId,
      round: 1,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      signupFee: 0,
      paymentFees: {},
      customFees: {},
      proposalPdfs: [],
      status: 'submitted',
      submittedBy: pgUser.id,
      submittedAt: new Date().toISOString(),
      signingTemplateId: templateId,
    });

    expect(await repo.findSigningTemplateId(bidId)).toBe(templateId);

    // 봉인 경계 회귀 가드 — findById()의 반환 객체(Bid)에 이 필드가 있으면 안 된다.
    const found = await repo.findById(bidId);
    expect(found).not.toHaveProperty('signingTemplateId');
  });

  it('save() without signingTemplateId leaves the column null (기존 호출자 하위호환)', async () => {
    const { repo, rfpId, pgWs, pgUser, invitationId } = await setup();

    const bidId = randomUUID();
    await repo.save({
      id: bidId,
      rfpId,
      pgWsId: pgWs.id,
      invitationId,
      round: 1,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      signupFee: 0,
      paymentFees: {},
      customFees: {},
      proposalPdfs: [],
      status: 'submitted',
      submittedBy: pgUser.id,
      submittedAt: new Date().toISOString(),
    });

    expect(await repo.findSigningTemplateId(bidId)).toBeUndefined();
  });
});

describe('DrizzleBidRepository.findOwner', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  // Lightweight bid-only owner lookup for the attachment ACL. Unlike
  // findRfpOwner (bids⋈rfps innerJoin), this reads bids alone so the ACL can
  // resolve the PG fast-path (bid.pgWsId === viewer ws) WITHOUT requiring the
  // RFP row to exist — preserving the exact branch ordering of the raw ACL.
  it('returns pgWsId + rfpId for a known bid (no rfp join)', async () => {
    const { bidId } = await insertBid(ctx.db, ctx, 0);
    expect(await ctx.repo.findOwner(bidId)).toEqual({
      pgWsId: ctx.pgWs.id,
      rfpId: ctx.rfpId,
    });
  });

  it('returns undefined for an unknown bid', async () => {
    expect(await ctx.repo.findOwner(randomUUID())).toBeUndefined();
  });
});

// Narrow batch reader for award-winner resolution. Deliberately NOT a
// `findByIds` returning full `Bid` objects: the conversation-list loader only
// needs "which PG workspace won", and pulling whole bids (fees, memo, plus a
// second attachments query each) into a chat loader drags sealed-bid
// financials somewhere they have no business being. Same reasoning as
// `findSigningTemplateId`, which bypasses BID_COLUMNS/rowToBid for the
// identical boundary reason.
describe('DrizzleBidRepository.findPgWsIdsByIds', () => {
  async function ctxWithBids() {
    const db = await createPgliteDb();
    const repo = new DrizzleBidRepository(db);
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgA = await seedPgWorkspace(db, 'wa.io');
    const pgB = await seedPgWorkspace(db, 'wb.io');
    const a = await seedInvited(db, buyerWs.id, buyer.id, pgA.id);
    const b = await seedInvited(db, buyerWs.id, buyer.id, pgB.id);
    const mk = (rfpId: string, invitationId: string, pgWsId: string) => ({
      id: randomUUID(),
      round: 1,
      rfpId,
      pgWsId,
      invitationId,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      signupFee: 0,
      paymentFees: {},
      customFees: {},
      proposalPdfs: [],
      status: 'submitted' as const,
      submittedBy: buyer.id,
      submittedAt: new Date().toISOString(),
    });
    const bidA = mk(a.rfpId, a.invId, pgA.id);
    const bidB = mk(b.rfpId, b.invId, pgB.id);
    await repo.save(bidA);
    await repo.save(bidB);
    return { repo, bidA, bidB, pgA, pgB };
  }

  it('maps each bid id to its owning PG workspace', async () => {
    const { repo, bidA, bidB, pgA, pgB } = await ctxWithBids();

    const rows = await repo.findPgWsIdsByIds([bidA.id, bidB.id]);

    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((r) => [r.id, r.pgWsId]));
    expect(byId.get(bidA.id)).toBe(pgA.id);
    expect(byId.get(bidB.id)).toBe(pgB.id);
  });

  it('omits unknown bid ids', async () => {
    const { repo, bidA } = await ctxWithBids();

    const rows = await repo.findPgWsIdsByIds([bidA.id, randomUUID()]);

    expect(rows.map((r) => r.id)).toEqual([bidA.id]);
  });

  it('returns [] for an empty id list without querying', async () => {
    const { repo } = await ctxWithBids();
    await expect(repo.findPgWsIdsByIds([])).resolves.toEqual([]);
  });
});
