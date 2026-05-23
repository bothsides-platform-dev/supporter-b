// moveCardAction — PLACEMENT-ONLY into custom columns. Lifecycle-column drops
// are client-dispatched (see board/_shared.ts), so there is no "fires action"
// branch here.
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

import { moveCardAction } from '../moveCardAction';
import { getBidRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

async function colByTitle(wsId: string, title: string): Promise<string> {
  const [c] = await db
    .select()
    .from(columns)
    .where(and(eq(columns.workspaceId, wsId), eq(columns.title, title)));
  return c.id;
}

async function setup() {
  const buyer = await seedUser(db, { email: 'b@buyer.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  await db.insert(columns).values(defaultColumns(buyerWs.id, 'buyer'));

  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'sales@toss.im' });
  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-4001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'move test',
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
    deposit: '0',
    setupFee: '0',
    monthlyMin: '0',
    bankTransferFeePct: '0.015',
    easyPayFeePct: '0.018',
    submittedBy: pgUser.id,
  });

  return { buyer, buyerWs, bidId };
}

function asBuyer(s: { buyer: { id: string; email: string }; buyerWs: { id: string } }) {
  sessionRef.value = {
    user: {
      id: s.buyer.id,
      email: s.buyer.email,
      workspaceId: s.buyerWs.id,
      workspaceType: 'buyer',
      role: 'admin',
    },
  };
}

describe('moveCardAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await moveCardAction({
      cardType: 'bid',
      cardId: randomUUID(),
      toColumnId: randomUUID(),
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a column owned by another workspace', async () => {
    const s = await setup();
    asBuyer(s);
    // a custom column in a DIFFERENT buyer workspace
    const otherWs = await seedBuyerWorkspace(db, {});
    const otherCol = randomUUID();
    await db.insert(columns).values({
      id: otherCol,
      workspaceId: otherWs.id,
      kind: 'rfp_bids',
      title: '협상중',
      position: 'a1',
      lifecycleKey: null,
    });
    const r = await moveCardAction({
      cardType: 'bid',
      cardId: s.bidId,
      toColumnId: otherCol,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('rejects a cross-kind target (bid into a pipeline column)', async () => {
    const s = await setup();
    asBuyer(s);
    const pipelineCustom = randomUUID();
    await db.insert(columns).values({
      id: pipelineCustom,
      workspaceId: s.buyerWs.id,
      kind: 'pipeline',
      title: '보류',
      position: 'z1',
      lifecycleKey: null,
    });
    const r = await moveCardAction({
      cardType: 'bid',
      cardId: s.bidId,
      toColumnId: pipelineCustom,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('CROSS_KIND');
  });

  it('rejects dropping onto a system column (default-landing / lifecycle)', async () => {
    const s = await setup();
    asBuyer(s);
    const landing = await colByTitle(s.buyerWs.id, '진행전'); // is_system default
    const r = await moveCardAction({
      cardType: 'bid',
      cardId: s.bidId,
      toColumnId: landing,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NOT_A_DROP_TARGET');
  });

  it('places a bid into a custom column, then moves it (board_column_id)', async () => {
    const s = await setup();
    asBuyer(s);
    const nego = await colByTitle(s.buyerWs.id, '협상중');
    const decided = await colByTitle(s.buyerWs.id, '결정');
    const repo = await getBidRepo();

    expect((await moveCardAction({ cardType: 'bid', cardId: s.bidId, toColumnId: nego })).ok).toBe(true);
    expect((await repo.findById(s.bidId))?.boardColumnId).toBe(nego);

    expect((await moveCardAction({ cardType: 'bid', cardId: s.bidId, toColumnId: decided })).ok).toBe(true);
    expect((await repo.findById(s.bidId))?.boardColumnId).toBe(decided);
  });
});
