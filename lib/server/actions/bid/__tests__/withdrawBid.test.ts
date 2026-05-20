// withdrawBidAction tests.
//
// Coverage:
//   - 같은 ws 가드: 다른 ws bid 철회 차단
//   - 워크스페이스 동료가 동료 제안 철회 가능 (협업 정책)
//   - 멱등성: 이미 withdrawn 인 bid 재호출 ok
//   - withdrawn 후 같은 (rfpId, pgWsId)로 다시 submit → BID_ALREADY_SUBMITTED
//     (advisor pin 4: v0 단순화)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  bids,
  rfps,
  rfpInvitations,
} from '@/lib/db/schema';
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

const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      name?: string;
      workspaceId: string;
      workspaceType: 'pg';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requirePgSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_PG'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { withdrawBidAction } from '../withdrawBidAction';
import { submitBidAction } from '../submitBidAction';

let db: PgliteDB;

async function setup() {
  const buyer = await seedUser(db, { email: 'b@buyer.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'sales@toss.im' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-0001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'withdraw test',
    memo: '',
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

  return { rfpId, buyerWsId: buyerWs.id, pgWsId: pgWs.id, pgUser, invId };
}

const submitInput = {
  settleCycle: 'D+1' as const,
  deposit: 0,
  setupFee: 0,
  monthlyMin: 0,
  bankTransferFeePct: 0.001,
  easyPayFeePct: 0.018,
};

describe('withdrawBidAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without PG session', async () => {
    sessionRef.value = null;
    const r = await withdrawBidAction({ bidId: randomUUID() });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown bid', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.pgUser.id,
        email: s.pgUser.email,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r = await withdrawBidAction({ bidId: randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('BID_NOT_FOUND');
  });

  it('happy path: submitted → withdrawn', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.pgUser.id,
        email: s.pgUser.email,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r1 = await submitBidAction({ rfpId: s.rfpId, ...submitInput });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const r2 = await withdrawBidAction({ bidId: r1.bidId });
    expect(r2.ok).toBe(true);

    const [row] = await db.select().from(bids).where(eq(bids.id, r1.bidId));
    expect(row.status).toBe('withdrawn');
  });

  it('idempotent — withdrawing an already-withdrawn bid is ok', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.pgUser.id,
        email: s.pgUser.email,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r1 = await submitBidAction({ rfpId: s.rfpId, ...submitInput });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = await withdrawBidAction({ bidId: r1.bidId });
    expect(r2.ok).toBe(true);
    const r3 = await withdrawBidAction({ bidId: r1.bidId });
    expect(r3.ok).toBe(true);
  });

  it('workspace peer can withdraw a colleague-submitted bid (collaboration policy)', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.pgUser.id,
        email: s.pgUser.email,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r1 = await submitBidAction({ rfpId: s.rfpId, ...submitInput });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Peer @toss.im member — joined the ws but did not submit the bid.
    const peer = await seedUser(db, { email: 'cs@toss.im' });
    await seedMembership(db, s.pgWsId, peer.id);
    sessionRef.value = {
      user: {
        id: peer.id,
        email: 'cs@toss.im',
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'member',
      },
    };

    const r2 = await withdrawBidAction({ bidId: r1.bidId });
    expect(r2.ok).toBe(true);

    // bid is now withdrawn.
    const [row] = await db.select().from(bids).where(eq(bids.id, r1.bidId));
    expect(row.status).toBe('withdrawn');
  });

  it('cross-workspace user cannot withdraw — bid.pgWsId mismatch blocks', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.pgUser.id,
        email: s.pgUser.email,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r1 = await submitBidAction({ rfpId: s.rfpId, ...submitInput });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Different PG workspace's user.
    const otherWs = await seedPgWorkspace(db, '이니시스');
    const otherUser = await seedUser(db, { email: 'sales@inicis.com' });
    await seedMembership(db, otherWs.id, otherUser.id);
    sessionRef.value = {
      user: {
        id: otherUser.id,
        email: 'sales@inicis.com',
        workspaceId: otherWs.id,
        workspaceType: 'pg',
        role: 'member',
      },
    };

    const r2 = await withdrawBidAction({ bidId: r1.bidId });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('FORBIDDEN');

    const [row] = await db.select().from(bids).where(eq(bids.id, r1.bidId));
    expect(row.status).toBe('submitted');
  });

  it('after withdraw, re-submit same (rfpId, pgWsId) returns BID_ALREADY_SUBMITTED (v0 simplification, advisor pin 4)', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.pgUser.id,
        email: s.pgUser.email,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r1 = await submitBidAction({ rfpId: s.rfpId, ...submitInput });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    await withdrawBidAction({ bidId: r1.bidId });

    const r2 = await submitBidAction({ rfpId: s.rfpId, ...submitInput });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('BID_ALREADY_SUBMITTED');
  });
});
