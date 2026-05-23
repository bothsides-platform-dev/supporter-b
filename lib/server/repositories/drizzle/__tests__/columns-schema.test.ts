// Schema-level test for the unified kanban tables (M1).
// Confirms the 0003 migration creates:
//   1. columns table with the expected columns/enums/nullable lifecycle_key
//   2. partial unique (workspace_id, kind, lifecycle_key) WHERE lifecycle_key IS NOT NULL
//      — one lifecycle column per board, but unlimited custom (null) columns
//   3. rfp/invitation/bid_placements: one placement per card (card_id unique) +
//      FK cascade from columns
// If the migration is missing/incorrect the test fails at SQL time.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  columns,
  rfpPlacements,
  invitationPlacements,
  bidPlacements,
  bids,
  rfps,
  rfpInvitations,
} from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db, { email: 'buyer@cols.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-7001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'cols test',
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

  return { db, buyerWs, rfpId, invitationId, bidId };
}

describe('M1 schema — unified kanban columns + placements', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('columns row round-trips with enum kind, nullable color/lifecycle_key', async () => {
    const id = randomUUID();
    await ctx.db.insert(columns).values({
      id,
      workspaceId: ctx.buyerWs.id,
      kind: 'pipeline',
      title: '발송',
      position: 'a1',
      lifecycleKey: 'sent',
      isSystem: true,
    });
    const [row] = await ctx.db.select().from(columns).where(eq(columns.id, id));
    expect(row.kind).toBe('pipeline');
    expect(row.title).toBe('발송');
    expect(row.lifecycleKey).toBe('sent');
    expect(row.isSystem).toBe(true);
    expect(row.color).toBeNull();
  });

  it('rejects a duplicate lifecycle column but allows many custom (null) columns', async () => {
    await ctx.db.insert(columns).values({
      id: randomUUID(),
      workspaceId: ctx.buyerWs.id,
      kind: 'pipeline',
      title: '발송',
      position: 'a1',
      lifecycleKey: 'sent',
      isSystem: true,
    });

    await expect(
      ctx.db.insert(columns).values({
        id: randomUUID(),
        workspaceId: ctx.buyerWs.id,
        kind: 'pipeline',
        title: '발송 중복',
        position: 'a2',
        lifecycleKey: 'sent',
        isSystem: true,
      }),
    ).rejects.toThrow();

    // Two custom (null lifecycle_key) columns on the same (ws, kind) are allowed.
    await ctx.db.insert(columns).values({
      id: randomUUID(),
      workspaceId: ctx.buyerWs.id,
      kind: 'pipeline',
      title: '보류',
      position: 'b1',
    });
    await ctx.db.insert(columns).values({
      id: randomUUID(),
      workspaceId: ctx.buyerWs.id,
      kind: 'pipeline',
      title: '우선검토',
      position: 'b2',
    });
    const all = await ctx.db.select().from(columns);
    expect(all.filter((c) => c.lifecycleKey === null)).toHaveLength(2);
  });

  it('bid_placements: one placement per bid, cascades when its column is deleted', async () => {
    const colId = randomUUID();
    await ctx.db.insert(columns).values({
      id: colId,
      workspaceId: ctx.buyerWs.id,
      kind: 'rfp_bids',
      title: '협상중',
      position: 'a1',
    });
    await ctx.db.insert(bidPlacements).values({
      id: randomUUID(),
      columnId: colId,
      bidId: ctx.bidId,
      position: 'a1',
    });

    // Second placement for the same bid is rejected (card_id unique).
    const colId2 = randomUUID();
    await ctx.db.insert(columns).values({
      id: colId2,
      workspaceId: ctx.buyerWs.id,
      kind: 'rfp_bids',
      title: '결정',
      position: 'a2',
    });
    await expect(
      ctx.db.insert(bidPlacements).values({
        id: randomUUID(),
        columnId: colId2,
        bidId: ctx.bidId,
        position: 'a1',
      }),
    ).rejects.toThrow();

    // Deleting the column cascades its placements.
    await ctx.db.delete(columns).where(eq(columns.id, colId));
    const left = await ctx.db
      .select()
      .from(bidPlacements)
      .where(eq(bidPlacements.bidId, ctx.bidId));
    expect(left).toHaveLength(0);
  });

  it('rfp_placements and invitation_placements round-trip', async () => {
    const colId = randomUUID();
    await ctx.db.insert(columns).values({
      id: colId,
      workspaceId: ctx.buyerWs.id,
      kind: 'pipeline',
      title: '보류',
      position: 'a1',
    });
    await ctx.db.insert(rfpPlacements).values({
      id: randomUUID(),
      columnId: colId,
      rfpId: ctx.rfpId,
      position: 'a1',
    });
    await ctx.db.insert(invitationPlacements).values({
      id: randomUUID(),
      columnId: colId,
      invitationId: ctx.invitationId,
      position: 'a1',
    });
    expect(await ctx.db.select().from(rfpPlacements)).toHaveLength(1);
    expect(await ctx.db.select().from(invitationPlacements)).toHaveLength(1);
  });
});
