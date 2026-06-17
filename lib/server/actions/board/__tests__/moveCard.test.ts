// moveCardAction — PLACEMENT-ONLY into custom columns. Lifecycle-column drops
// are client-dispatched (see board/_shared.ts), so there is no "fires action"
// branch here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rfps, columns } from '@/lib/db/schema';
import { defaultColumns } from '@/lib/server/columns/seed';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
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
import { getRfpRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

async function setup() {
  const buyer = await seedUser(db, { email: 'b@buyer.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  await db.insert(columns).values(defaultColumns(buyerWs.id, 'buyer'));

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

  return { buyer, buyerWs, rfpId };
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
    const s = await setup();
    const r = await moveCardAction({
      cardType: 'rfp',
      cardId: s.rfpId,
      toColumnId: randomUUID(),
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an rfp column owned by another workspace', async () => {
    const s = await setup();
    asBuyer(s);
    const otherWs = await seedBuyerWorkspace(db, {});
    const otherCol = randomUUID();
    await db.insert(columns).values({
      id: otherCol,
      workspaceId: otherWs.id,
      kind: 'pipeline',
      title: '보류',
      position: 'a1',
      lifecycleKey: null,
    });
    const r = await moveCardAction({ cardType: 'rfp', cardId: s.rfpId, toColumnId: otherCol });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('places an rfp into a custom column (board_column_id)', async () => {
    const s = await setup();
    asBuyer(s);
    const customCol = randomUUID();
    await db.insert(columns).values({
      id: customCol,
      workspaceId: s.buyerWs.id,
      kind: 'pipeline',
      title: '보류',
      position: 'z1',
      lifecycleKey: null,
    });
    const repo = await getRfpRepo();
    const r = await moveCardAction({ cardType: 'rfp', cardId: s.rfpId, toColumnId: customCol });
    expect(r.ok).toBe(true);
    expect((await repo.findById(s.rfpId))?.boardColumnId).toBe(customCol);
  });
});
