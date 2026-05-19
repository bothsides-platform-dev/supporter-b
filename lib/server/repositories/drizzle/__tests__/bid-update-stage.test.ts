// DrizzleBidRepository.updateBuyerStage — Stage 3a 의 buyer_stage 컬럼을
// 액션 레이어가 호출할 수 있게 repo 메서드로 노출하는지 검증.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { bids, rfpInvitations, rfps } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
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
  const buyer = await seedUser(db, { email: 'buyer@stage.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  const rfpId = 'P-2605-9201';
  await db.insert(rfps).values({
    id: rfpId,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'stage test',
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
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId,
    pgWsId: pgWs.id,
    invitationId,
    settleCycle: 'D+1',
    deposit: '0',
    setupFee: '0',
    monthlyMin: '0',
    bankTransferFeePct: '0.015',
    easyPayFeePct: '0.018',
    proposalAttachmentId: null,
    submittedBy: pgUser.id,
  });

  return { db, bidId, repo: new DrizzleBidRepository(db) };
}

describe('DrizzleBidRepository.updateBuyerStage', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('updates buyer_stage and findById reflects the new value', async () => {
    const before = await ctx.repo.findById(ctx.bidId);
    expect(before?.buyerStage).toBe('pending');

    await ctx.repo.updateBuyerStage(ctx.bidId, 'negotiating');
    const after = await ctx.repo.findById(ctx.bidId);
    expect(after?.buyerStage).toBe('negotiating');

    await ctx.repo.updateBuyerStage(ctx.bidId, 'decided');
    const final = await ctx.repo.findById(ctx.bidId);
    expect(final?.buyerStage).toBe('decided');
  });

  it('throws when bid not found', async () => {
    await expect(
      ctx.repo.updateBuyerStage(randomUUID(), 'negotiating'),
    ).rejects.toThrow();
  });
});
