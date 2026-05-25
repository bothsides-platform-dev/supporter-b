// Column CRUD actions: add / rename / recolor / reorder / delete.
// Cross-workspace guard on every mutation; only DELETE guards is_system
// (rename/recolor/reorder are allowed on system columns).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { bids, rfps, rfpInvitations, columns } from '@/lib/db/schema';
import { defaultColumns } from '@/lib/server/columns/seed';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessionUser = {
  id: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
  requireBuyerSession: () =>
    sessionRef.value?.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
  requirePgSession: () =>
    sessionRef.value?.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
}));

import { addColumnAction } from '../addColumnAction';
import { renameColumnAction } from '../renameColumnAction';
import { recolorColumnAction } from '../recolorColumnAction';
import { reorderColumnAction } from '../reorderColumnAction';
import { deleteColumnAction } from '../deleteColumnAction';
import { getColumnRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

async function colByTitle(wsId: string, title: string): Promise<string> {
  const [c] = await db
    .select()
    .from(columns)
    .where(and(eq(columns.workspaceId, wsId), eq(columns.title, title)));
  return c.id;
}

async function setupBuyer() {
  const buyer = await seedUser(db, { email: 'b@buyer.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  await db.insert(columns).values(defaultColumns(buyerWs.id, 'buyer'));
  sessionRef.value = {
    user: {
      id: buyer.id,
      email: buyer.email,
      workspaceId: buyerWs.id,
      workspaceType: 'buyer',
      role: 'admin',
    },
  };
  return { buyer, buyerWs };
}

describe('addColumnAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('creates a custom column (lifecycleKey null ⇒ deletable)', async () => {
    const { buyerWs } = await setupBuyer();
    const r = await addColumnAction({ kind: 'pipeline', title: '보류', color: 'warning', position: 'z1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const col = await (await getColumnRepo()).findById(r.columnId);
      expect(col).toMatchObject({
        workspaceId: buyerWs.id,
        kind: 'pipeline',
        title: '보류',
        color: 'warning',
        lifecycleKey: null,
      });
    }
  });

  it('rejects pg adding an rfp_bids column (no bid board for pg)', async () => {
    const pgUser = await seedUser(db, { email: 'p@pg.com' });
    const pgWs = await seedPgWorkspace(db, 'toss.im');
    sessionRef.value = {
      user: {
        id: pgUser.id,
        email: pgUser.email,
        workspaceId: pgWs.id,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r = await addColumnAction({ kind: 'rfp_bids', title: 'x', position: 'a1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_KIND');
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await addColumnAction({ kind: 'pipeline', title: 'x', position: 'a1' });
    expect(r.ok).toBe(false);
  });
});

describe('rename / recolor / reorder', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rename is allowed on a system column', async () => {
    const { buyerWs } = await setupBuyer();
    const active = await colByTitle(buyerWs.id, '진행중');
    const r = await renameColumnAction({ columnId: active, title: '진행중-수정' });
    expect(r.ok).toBe(true);
    expect((await (await getColumnRepo()).findById(active))?.title).toBe('진행중-수정');
  });

  it('rejects mutating a column in another workspace', async () => {
    await setupBuyer();
    const otherWs = await seedBuyerWorkspace(db, {});
    const otherCol = randomUUID();
    await db.insert(columns).values({
      id: otherCol,
      workspaceId: otherWs.id,
      kind: 'pipeline',
      title: '남의 컬럼',
      position: 'a1',
      lifecycleKey: null,
    });
    const r = await renameColumnAction({ columnId: otherCol, title: 'hijack' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('recolor and reorder patch the column', async () => {
    const { buyerWs } = await setupBuyer();
    const active = await colByTitle(buyerWs.id, '진행중');
    expect((await recolorColumnAction({ columnId: active, color: 'primary' })).ok).toBe(true);
    expect((await reorderColumnAction({ columnId: active, position: 'm5' })).ok).toBe(true);
    const col = await (await getColumnRepo()).findById(active);
    expect(col?.color).toBe('primary');
    expect(col?.position).toBe('m5');
  });
});

describe('deleteColumnAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects a cross-side lifecycle column', async () => {
    const { buyerWs } = await setupBuyer();
    const active = await colByTitle(buyerWs.id, '진행중'); // lifecycleKey='active' (cross-side)
    const r = await deleteColumnAction({ columnId: active });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('COLUMN_CROSS_SIDE_LOCKED');
  });

  it('rejects a private-skeleton system column', async () => {
    const { buyerWs } = await setupBuyer();
    const draft = await colByTitle(buyerWs.id, '작성중'); // lifecycleKey='draft' (not cross-side)
    const r = await deleteColumnAction({ columnId: draft });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('COLUMN_SYSTEM_LOCKED');
  });

  it('rejects the default-landing column', async () => {
    const { buyerWs } = await setupBuyer();
    const landing = await colByTitle(buyerWs.id, '진행전');
    const r = await deleteColumnAction({ columnId: landing });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('COLUMN_SYSTEM_LOCKED');
  });

  it('deletes a custom column and cascades its placements', async () => {
    const { buyer, buyerWs } = await setupBuyer();
    // a bid placed in 협상중
    const pgWs = await seedPgWorkspace(db, 'toss.im');
    const pgUser = await seedUser(db, { email: 's@toss.im' });
    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2605-6001',
      buyerWsId: buyerWs.id,
      title: 'del',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
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
    const nego = await colByTitle(buyerWs.id, '협상중');
    await db.update(bids).set({ boardColumnId: nego }).where(eq(bids.id, bidId));

    const r = await deleteColumnAction({ columnId: nego });
    expect(r.ok).toBe(true);
    expect(await (await getColumnRepo()).findById(nego)).toBeUndefined();
    // ON DELETE SET NULL ⇒ the bid falls back to auto-classification (진행전).
    const [after] = await db.select().from(bids).where(eq(bids.id, bidId));
    expect(after.boardColumnId).toBeNull();
  });
});
