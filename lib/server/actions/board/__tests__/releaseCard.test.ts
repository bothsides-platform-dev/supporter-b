// releaseCardAction — removes a card's explicit placement so it returns to
// auto-classification ("자동 분류로 되돌리기" menu).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

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

import { releaseCardAction } from '../releaseCardAction';
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
    code: 'P-2605-5001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'release test',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });
  // place the rfp in a custom pipeline column so there is something to release
  const customColId = randomUUID();
  await db.insert(columns).values({
    id: customColId,
    workspaceId: buyerWs.id,
    kind: 'pipeline',
    title: '보류',
    position: 'z1',
    lifecycleKey: null,
  });
  await db.update(rfps).set({ boardColumnId: customColId }).where(eq(rfps.id, rfpId));

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

describe('releaseCardAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await releaseCardAction({ cardType: 'rfp', cardId: randomUUID() });
    expect(r.ok).toBe(false);
  });

  it('rejects an rfp owned by another workspace', async () => {
    const s = await setup();
    const otherUser = await seedUser(db, { email: 'o@x.com' });
    const otherWs = await seedBuyerWorkspace(db, {});
    sessionRef.value = {
      user: {
        id: otherUser.id,
        email: otherUser.email,
        workspaceId: otherWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await releaseCardAction({ cardType: 'rfp', cardId: s.rfpId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('clears board_column_id (returns the rfp to auto-classification)', async () => {
    const s = await setup();
    asBuyer(s);
    const repo = await getRfpRepo();

    const r = await releaseCardAction({ cardType: 'rfp', cardId: s.rfpId });
    expect(r.ok).toBe(true);
    expect((await repo.findById(s.rfpId))?.boardColumnId).toBeNull();
  });
});
