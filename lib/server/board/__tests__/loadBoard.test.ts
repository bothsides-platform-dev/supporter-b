import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __useDrizzleWithDbForTest,
  __resetForTest,
} from '@/lib/server/repositories/factory';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { defaultColumns } from '@/lib/server/columns/seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { bids, rfps, rfpInvitations, columns } from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;

async function colByTitle(wsId: string, title: string): Promise<string> {
  const [c] = await db
    .select()
    .from(columns)
    .where(and(eq(columns.workspaceId, wsId), eq(columns.title, title)));
  return c.id;
}

async function setupBuyer() {
  const buyer = await seedUser(db, { email: 'b@lb.com' });
  const biz = await seedBizProfile(db);
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await db.insert(columns).values(defaultColumns(ws.id, 'buyer'));
  return { buyer, biz, ws };
}

beforeEach(async () => {
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  __resetForTest();
});

describe('loadBoard — pipeline (buyer)', () => {
  it('excludes a draft RFP from the buyer board (작성중 단계 제거 — 테이블에서만 접근)', async () => {
    const { buyer, ws } = await setupBuyer();
    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2605-0001',
      buyerWsId: ws.id,
      title: 'draft rfp',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'draft',
      createdBy: buyer.id,
    });

    const board = await loadBoard({ workspaceId: ws.id, workspaceType: 'buyer', kind: 'pipeline' });

    expect(board.cards.find((c) => c.cardId === rfpId)).toBeUndefined();
  });

  it('an explicit placement overrides the lifecycle column', async () => {
    const { buyer, ws } = await setupBuyer();
    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2605-0002',
      buyerWsId: ws.id,
      title: 'placed rfp',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
    });
    // Add a custom column and place the RFP there via board_column_id.
    const customId = randomUUID();
    await db.insert(columns).values({
      id: customId,
      workspaceId: ws.id,
      kind: 'pipeline',
      title: '보류',
      position: 'z9',
      lifecycleKey: null,
    });
    await db.update(rfps).set({ boardColumnId: customId }).where(eq(rfps.id, rfpId));

    const board = await loadBoard({ workspaceId: ws.id, workspaceType: 'buyer', kind: 'pipeline' });
    const card = board.cards.find((c) => c.cardId === rfpId);
    expect(card?.columnId).toBe(customId);
  });
});

describe('loadBoard — rfp_bids (buyer)', () => {
  async function setupRfpWithBids() {
    const { buyer, biz, ws } = await setupBuyer();
    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2605-0003',
      buyerWsId: ws.id,
      bizProfileId: biz.id,
      title: 'bids rfp',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
    let n = 0;
    // Each bid needs its own PG workspace — bids are unique per (rfp, pg_ws).
    async function mkBid(): Promise<string> {
      n += 1;
      const pgWs = await seedPgWorkspace(db, `pg${n}.im`, { name: `PG ${n}` });
      const pgUser = await seedUser(db, { email: `pg${n}@x.im` });
      const invId = randomUUID();
      await db.insert(rfpInvitations).values({
        id: invId,
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
        invitationId: invId,
        settleCycle: 'D+1',
        settleLimit: '0',
        guaranteeInsurance: '0',
        paymentFees: {},
        submittedBy: pgUser.id,
      });
      return bidId;
    }
    return { ws, rfpId, mkBid };
  }

  it('unplaced bids land in 진행전; placed bids honor their column', async () => {
    const { ws, rfpId, mkBid } = await setupRfpWithBids();
    const placedBid = await mkBid();
    const unplacedBid = await mkBid();

    const negoId = await colByTitle(ws.id, '협상중');
    await db.update(bids).set({ boardColumnId: negoId }).where(eq(bids.id, placedBid));

    const board = await loadBoard({
      workspaceId: ws.id,
      workspaceType: 'buyer',
      kind: 'rfp_bids',
      scope: { rfpId },
    });

    const landing = await colByTitle(ws.id, '진행전');
    expect(board.cards.find((c) => c.cardId === unplacedBid)?.columnId).toBe(landing);
    expect(board.cards.find((c) => c.cardId === placedBid)?.columnId).toBe(negoId);
  });

  it('throws when rfp_bids is requested without a scope', async () => {
    const { ws } = await setupBuyer();
    await expect(
      loadBoard({ workspaceId: ws.id, workspaceType: 'buyer', kind: 'rfp_bids' }),
    ).rejects.toThrow();
  });
});
