// DrizzleBidRepository — proposalPdfs(N개) url 계약 검증.
// 첨부가 달린 bid는 findById/findByRfp/findByPgWs 어느 경로로 조회하든
// proposalPdfs[i].url === `/api/files/{attachmentId}` 여야 한다.
// 첨부가 없는 bid는 빈 배열.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments, bids, rfpInvitations, rfps } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleBidRepository } from '../bid';
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
});
