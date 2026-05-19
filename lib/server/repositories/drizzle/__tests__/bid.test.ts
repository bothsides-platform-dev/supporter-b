// DrizzleBidRepository — Bid.proposalPdf.url 계약 검증.
// 첨부가 달린 bid는 findById/findByRfp/findByPgWs 어느 경로로 조회하든
// proposalPdf.url === `/api/files/{attachmentId}` 여야 한다.
// 첨부가 없는 bid는 placeholder (`url: ''`) 그대로.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  attachments,
  bids,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
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

  const rfpId = 'P-2605-0042';
  await db.insert(rfps).values({
    id: rfpId,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'bid repo test',
    memo: '',
    allowedPgWorkspaceIds: [pgWs.id],
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

async function insertBidWithAttachment(
  db: PgliteDB,
  ctx: Awaited<ReturnType<typeof setup>>,
  opts?: { withAttachment: boolean },
) {
  const withAttachment = opts?.withAttachment ?? true;
  let proposalAttachmentId: string | null = null;

  if (withAttachment) {
    proposalAttachmentId = randomUUID();
    await db.insert(attachments).values({
      id: proposalAttachmentId,
      ownerKind: 'bid_proposal',
      ownerId: ctx.rfpId,
      name: 'proposal.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      storagePath: '2026/05/proposal-raw.pdf',
      uploadedBy: ctx.pgUser.id,
    });
  }

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
    proposalAttachmentId,
    submittedBy: ctx.pgUser.id,
  });

  return { bidId, proposalAttachmentId };
}

describe('DrizzleBidRepository — proposalPdf.url 계약', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('findById: 첨부 달린 bid는 proposalPdf.url 이 /api/files/{attId}', async () => {
    const { bidId, proposalAttachmentId } = await insertBidWithAttachment(
      ctx.db,
      ctx,
    );

    const bid = await ctx.repo.findById(bidId);

    expect(bid).toBeDefined();
    expect(bid!.proposalPdf.id).toBe(proposalAttachmentId);
    expect(bid!.proposalPdf.url).toBe(`/api/files/${proposalAttachmentId}`);
    expect(bid!.proposalPdf.name).toBe('proposal.pdf');
  });

  it('findByRfp: 첨부 달린 bid도 /api/files/{attId} 로 url 노출', async () => {
    const { proposalAttachmentId } = await insertBidWithAttachment(ctx.db, ctx);

    const list = await ctx.repo.findByRfp(ctx.rfpId);

    expect(list).toHaveLength(1);
    expect(list[0].proposalPdf.url).toBe(`/api/files/${proposalAttachmentId}`);
  });

  it('첨부 없는 bid 는 placeholder (url: "") 유지', async () => {
    const { bidId } = await insertBidWithAttachment(ctx.db, ctx, {
      withAttachment: false,
    });

    const bid = await ctx.repo.findById(bidId);

    expect(bid).toBeDefined();
    expect(bid!.proposalPdf.id).toBe('');
    expect(bid!.proposalPdf.url).toBe('');
  });
});
