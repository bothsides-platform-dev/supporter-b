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
  return { db, repo, rfpId, pgWs, pgUser, invitationId };
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
    deposit: '0',
    setupFee: '0',
    monthlyMin: '0',
    bankTransferFeePct: '0.015',
    easyPayFeePct: '0.018',
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
