// Schema-level test for the unified kanban (embedded placement model).
// Confirms the generated migration creates:
//   1. columns table (no is_system) with nullable color/lifecycle_key
//   2. partial unique (workspace_id, kind, lifecycle_key) WHERE lifecycle_key
//      IS NOT NULL — one lifecycle column per board, unlimited custom (null)
//   3. card.board_column_id FK with ON DELETE SET NULL — placing a card then
//      deleting its column auto-returns the card to auto-classification (null)

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { columns, bids, rfps, rfpInvitations } from '@/lib/db/schema';
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

describe('M1 schema — unified kanban columns + embedded placement', () => {
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
    });
    const [row] = await ctx.db.select().from(columns).where(eq(columns.id, id));
    expect(row.kind).toBe('pipeline');
    expect(row.lifecycleKey).toBe('sent');
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
    });
    await expect(
      ctx.db.insert(columns).values({
        id: randomUUID(),
        workspaceId: ctx.buyerWs.id,
        kind: 'pipeline',
        title: '발송 중복',
        position: 'a2',
        lifecycleKey: 'sent',
      }),
    ).rejects.toThrow();

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

  it('bids.board_column_id resets to NULL when the column is deleted (ON DELETE SET NULL)', async () => {
    const colId = randomUUID();
    await ctx.db.insert(columns).values({
      id: colId,
      workspaceId: ctx.buyerWs.id,
      kind: 'rfp_bids',
      title: '협상중',
      position: 'a1',
    });
    await ctx.db.update(bids).set({ boardColumnId: colId }).where(eq(bids.id, ctx.bidId));
    expect((await ctx.db.select().from(bids).where(eq(bids.id, ctx.bidId)))[0].boardColumnId).toBe(
      colId,
    );

    await ctx.db.delete(columns).where(eq(columns.id, colId));
    const [after] = await ctx.db.select().from(bids).where(eq(bids.id, ctx.bidId));
    expect(after.boardColumnId).toBeNull();
  });

  it('rfp/invitation board_column_id round-trip', async () => {
    const colId = randomUUID();
    await ctx.db.insert(columns).values({
      id: colId,
      workspaceId: ctx.buyerWs.id,
      kind: 'pipeline',
      title: '보류',
      position: 'a1',
    });
    await ctx.db.update(rfps).set({ boardColumnId: colId }).where(eq(rfps.id, ctx.rfpId));
    await ctx.db
      .update(rfpInvitations)
      .set({ boardColumnId: colId })
      .where(eq(rfpInvitations.id, ctx.invitationId));
    expect((await ctx.db.select().from(rfps).where(eq(rfps.id, ctx.rfpId)))[0].boardColumnId).toBe(
      colId,
    );
    expect(
      (await ctx.db.select().from(rfpInvitations).where(eq(rfpInvitations.id, ctx.invitationId)))[0]
        .boardColumnId,
    ).toBe(colId);
  });
});
