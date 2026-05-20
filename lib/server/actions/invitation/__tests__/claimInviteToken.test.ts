// claimInviteTokenAction tests.
//
// Access is gated by MEMBERSHIP of the invited PG workspace (not by which ws is
// currently active — a user may belong to several). Coverage:
//   - UNAUTHENTICATED / INVITE_INVALID for bad/unknown token
//   - INVITE_NOT_MEMBER when user is not a member of inv.pgWsId
//   - Successful claim when active ws == invited ws (switchTo undefined)
//   - Member of invited ws but active elsewhere → ok + switchTo=pgWsId
//   - INVITE_USED on re-claim
//   - INVITE_EXPIRED on expired invitation
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
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
      workspaceId?: string;
      workspaceType?: 'buyer' | 'pg';
      role?: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
  requirePgSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_PG'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { claimInviteTokenAction } from '../claimInviteTokenAction';

let db: PgliteDB;

async function setup() {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, '서포터 B 페이');

  const rfpId = randomUUID();
  const rfpCode = 'P-2605-0001';
  await db.insert(rfps).values({
    id: rfpId,
    code: rfpCode,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'invite test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });

  const rawToken = generateToken();
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    tokenHash: hashToken(rawToken),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'pending',
  });

  return { rfpCode, invId, rawToken, buyerWsId: buyerWs.id, pgWsId: pgWs.id };
}

describe('claimInviteTokenAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects when unauthenticated', async () => {
    const ctx = await setup();
    sessionRef.value = null;
    const r = await claimInviteTokenAction(ctx.rawToken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('UNAUTHENTICATED');
  });

  it('returns INVITE_INVALID for unknown token', async () => {
    await setup();
    const u = await seedUser(db, { email: 'peer@toss.im' });
    sessionRef.value = { user: { id: u.id, email: u.email } };
    const r = await claimInviteTokenAction('not-a-real-token-xxx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_INVALID');
  });

  it('rejects a non-member of the invited workspace with INVITE_NOT_MEMBER', async () => {
    const ctx = await setup();
    // User belongs to a different PG workspace and is NOT a member of the
    // invited one — membership, not active-ws equality, is what gates access.
    const otherWs = await seedPgWorkspace(db, '다른PG');
    const u = await seedUser(db, { email: 'other@pg.com' });
    await seedMembership(db, otherWs.id, u.id, 'admin');
    sessionRef.value = {
      user: { id: u.id, email: u.email, workspaceId: otherWs.id },
    };

    const r = await claimInviteTokenAction(ctx.rawToken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_NOT_MEMBER');
  });

  it('returns INVITE_NOT_MEMBER when user has no workspaceId', async () => {
    const ctx = await setup();
    const u = await seedUser(db, { email: 'nomember@pg.com' });
    // No workspace membership at all
    sessionRef.value = { user: { id: u.id, email: u.email } };

    const r = await claimInviteTokenAction(ctx.rawToken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_NOT_MEMBER');
  });

  it('successful claim — user workspace matches pgWsId', async () => {
    const ctx = await setup();
    const u = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, ctx.pgWsId, u.id, 'admin');
    sessionRef.value = {
      user: { id: u.id, email: u.email, workspaceId: ctx.pgWsId },
    };

    const r = await claimInviteTokenAction(ctx.rawToken);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rfpId).toBe(ctx.rfpCode);
      // Active ws already == invited ws → no switch needed.
      expect(r.switchTo).toBeUndefined();
    }
  });

  it('member of invited ws but active elsewhere → ok + switchTo=pgWsId', async () => {
    const ctx = await setup();
    const u = await seedUser(db, { email: 'multi@toss.im' });
    // Member of the invited PG ws…
    await seedMembership(db, ctx.pgWsId, u.id, 'member');
    // …but also of another ws, which is the currently-active one.
    const otherWs = await seedPgWorkspace(db, '다른PG');
    await seedMembership(db, otherWs.id, u.id, 'admin');
    sessionRef.value = {
      user: { id: u.id, email: u.email, workspaceId: otherWs.id },
    };

    const r = await claimInviteTokenAction(ctx.rawToken);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rfpId).toBe(ctx.rfpCode);
      expect(r.switchTo).toBe(ctx.pgWsId);
    }
  });

  it('successful claim sets acceptedByUserId on invitation row', async () => {
    const ctx = await setup();
    const u = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, ctx.pgWsId, u.id, 'admin');
    sessionRef.value = {
      user: { id: u.id, email: u.email, workspaceId: ctx.pgWsId },
    };

    await claimInviteTokenAction(ctx.rawToken);

    const [row] = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.id, ctx.invId));
    expect(row.acceptedByUserId).toBe(u.id);
    expect(row.status).toBe('accepted');
  });

  it('second claim of same token by same-ws caller returns ok with alreadyClaimed', async () => {
    const ctx = await setup();
    const u = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, ctx.pgWsId, u.id, 'admin');
    sessionRef.value = {
      user: { id: u.id, email: u.email, workspaceId: ctx.pgWsId },
    };

    const r1 = await claimInviteTokenAction(ctx.rawToken);
    expect(r1.ok).toBe(true);

    // Re-claim by same/peer ws member — claimToken returns 'used' but action
    // surfaces ok=true + alreadyClaimed=true so the caller redirects to inbox
    // instead of seeing an error page (workspace-scoped access policy).
    const r2 = await claimInviteTokenAction(ctx.rawToken);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.alreadyClaimed).toBe(true);
      expect(r2.rfpId).toBe(ctx.rfpCode);
    }
  });

  it('expired token returns INVITE_EXPIRED', async () => {
    const buyer = await seedUser(db, { email: 'buyer-2@x.com' });
    const biz = await seedBizProfile(db, { bizNo: '9876543210' });
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const pgWs = await seedPgWorkspace(db, '만료테스트PG');

    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2605-0099',
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'expired invite test',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
    });

    const rawToken = generateToken();
    await db.insert(rfpInvitations).values({
      id: randomUUID(),
      rfpId,
      pgWsId: pgWs.id,
      tokenHash: hashToken(rawToken),
      sentAt: new Date(Date.now() - 8 * 86_400_000),
      expiresAt: new Date(Date.now() - 1000), // 1초 전 — 만료
      status: 'pending',
    });

    const u = await seedUser(db, { email: 'sales@expired.im' });
    await seedMembership(db, pgWs.id, u.id, 'admin');
    sessionRef.value = {
      user: { id: u.id, email: u.email, workspaceId: pgWs.id },
    };

    const r = await claimInviteTokenAction(rawToken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_EXPIRED');
  });

  // _suppress unused import warnings
  void and;
});
