import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { DrizzleBidPlacementRepository } from '@/lib/server/repositories/drizzle/bid-placement';
import { DrizzleRfpPlacementRepository } from '@/lib/server/repositories/drizzle/rfp-placement';
import { DrizzleInvitationPlacementRepository } from '@/lib/server/repositories/drizzle/invitation-placement';
import { DrizzleColumnRepository } from '@/lib/server/repositories/drizzle/column';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { bids, rfps, rfpInvitations } from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from './_seed';
import type { BoardColumn, ColumnKind } from '@/lib/types/column';

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db, { email: 'buyer@pl.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-8001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'placement test',
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
    submittedBy: pgUser.id,
  });

  const colRepo = new DrizzleColumnRepository(db);
  async function mkCol(kind: ColumnKind, title: string): Promise<BoardColumn> {
    const col: BoardColumn = {
      id: randomUUID(),
      workspaceId: buyerWs.id,
      kind,
      title,
      position: 'a1',
      color: null,
      lifecycleKey: null,
      isSystem: false,
    };
    await colRepo.create(col);
    return col;
  }

  return { db, buyerWs, rfpId, invitationId, bidId, mkCol };
}

describe('DrizzleBidPlacementRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('upsert then listByCards + listByColumn surfaces the placement', async () => {
    const repo = new DrizzleBidPlacementRepository(ctx.db);
    const col = await ctx.mkCol('rfp_bids', '협상중');
    await repo.upsert(col.id, ctx.bidId, 'a1');

    const byCard = await repo.listByCards([ctx.bidId]);
    expect(byCard.get(ctx.bidId)).toMatchObject({
      columnId: col.id,
      cardId: ctx.bidId,
      position: 'a1',
    });
    expect(await repo.listByColumn(col.id)).toHaveLength(1);
  });

  it('upsert moves a card to a new column (one row per card)', async () => {
    const repo = new DrizzleBidPlacementRepository(ctx.db);
    const a = await ctx.mkCol('rfp_bids', '협상중');
    const b = await ctx.mkCol('rfp_bids', '결정');
    await repo.upsert(a.id, ctx.bidId, 'a1');
    await repo.upsert(b.id, ctx.bidId, 'a2');

    const byCard = await repo.listByCards([ctx.bidId]);
    expect(byCard.get(ctx.bidId)?.columnId).toBe(b.id);
    expect(byCard.get(ctx.bidId)?.position).toBe('a2');
    expect(await repo.listByColumn(a.id)).toHaveLength(0);
    expect(await repo.listByColumn(b.id)).toHaveLength(1);
  });

  it('removeByCard deletes the placement', async () => {
    const repo = new DrizzleBidPlacementRepository(ctx.db);
    const col = await ctx.mkCol('rfp_bids', '협상중');
    await repo.upsert(col.id, ctx.bidId, 'a1');
    await repo.removeByCard(ctx.bidId);
    expect((await repo.listByCards([ctx.bidId])).size).toBe(0);
  });
});

describe('rfp & invitation placement repos round-trip', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('rfp placement upsert/list/remove', async () => {
    const repo = new DrizzleRfpPlacementRepository(ctx.db);
    const col = await ctx.mkCol('pipeline', '보류');
    await repo.upsert(col.id, ctx.rfpId, 'a1');
    expect((await repo.listByCards([ctx.rfpId])).get(ctx.rfpId)?.columnId).toBe(col.id);
    await repo.removeByCard(ctx.rfpId);
    expect((await repo.listByCards([ctx.rfpId])).size).toBe(0);
  });

  it('invitation placement upsert/list/remove', async () => {
    const repo = new DrizzleInvitationPlacementRepository(ctx.db);
    const col = await ctx.mkCol('pipeline', '보류');
    await repo.upsert(col.id, ctx.invitationId, 'a1');
    expect((await repo.listByCards([ctx.invitationId])).get(ctx.invitationId)?.columnId).toBe(
      col.id,
    );
    await repo.removeByCard(ctx.invitationId);
    expect((await repo.listByCards([ctx.invitationId])).size).toBe(0);
  });
});
