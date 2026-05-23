// releaseCardAction — removes a card's explicit placement so it returns to
// auto-classification (default-landing drop + "자동 분류로 되돌리기" menu).
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

import { releaseCardAction } from '../releaseCardAction';
import { getBidRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

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
    code: 'P-2605-5001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'release test',
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
  // place the bid in 협상중 so there's something to release
  const [nego] = await db
    .select()
    .from(columns)
    .where(and(eq(columns.workspaceId, buyerWs.id), eq(columns.title, '협상중')));
  await db.update(bids).set({ boardColumnId: nego.id }).where(eq(bids.id, bidId));

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
    const r = await releaseCardAction({ cardType: 'bid', cardId: randomUUID() });
    expect(r.ok).toBe(false);
  });

  it('rejects a card owned by another workspace', async () => {
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
    const r = await releaseCardAction({ cardType: 'bid', cardId: s.bidId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('clears board_column_id (returns the card to auto-classification)', async () => {
    const s = await setup();
    asBuyer(s);
    const repo = await getBidRepo();
    expect((await repo.findById(s.bidId))?.boardColumnId).toBeTruthy();

    const r = await releaseCardAction({ cardType: 'bid', cardId: s.bidId });
    expect(r.ok).toBe(true);
    expect((await repo.findById(s.bidId))?.boardColumnId).toBeNull();
  });
});
