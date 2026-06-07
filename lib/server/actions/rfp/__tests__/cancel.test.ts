import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  bids,
  notifications,
  outboxEntries,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      workspaceId: string;
      workspaceType: 'buyer';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => Promise.reject(new Error('unused')),
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { cancelRfpAction } from '../cancelRfpAction';

let db: PgliteDB;

async function seedSentRfpWithBid() {
  const buyer = await seedUser(db, { email: 'b@x.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });
  await seedMembership(db, pgWs.id, pgUser.id);

  const rfpId = randomUUID();
    const rfpCode = 'P-2605-0010';
  await db.insert(rfps).values({
    id: rfpId,
    code: rfpCode,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'cancel test',
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
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    status: 'accepted',
  });
  await db.insert(bids).values({
    id: randomUUID(),
    rfpId,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    status: 'submitted',
    submittedBy: pgUser.id,
    submittedAt: new Date(),
  });
  return { buyerUserId: buyer.id, buyerWsId: buyerWs.id, pgWsId: pgWs.id, pgUserId: pgUser.id, rfpId, rfpCode };
}

describe('cancelRfpAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('flips status to cancelled + sends in-app notif (no outbox)', async () => {
    const s = await seedSentRfpWithBid();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'b@x.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await cancelRfpAction({ rfpId: s.rfpCode });
    expect(r.ok).toBe(true);

    const [row] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(row.status).toBe('cancelled');

    const ns = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'rfp.cancelled'));
    expect(ns).toHaveLength(1);
    expect(ns[0].userId).toBe(s.pgUserId);
    expect(ns[0].channel).toBe('in_app');
    // Notification link must carry the human code (inbox resolves by code).
    expect(ns[0].linkUrl).toBe(`/inbox/${s.rfpCode}`);
    expect(ns[0].linkUrl).not.toContain(s.rfpId);

    // No email outbox for cancellation.
    const outbox = await db.select().from(outboxEntries);
    expect(outbox.every((o) => o.event !== 'rfp.awarded')).toBe(true);
  });

  it('rejects ownership mismatch', async () => {
    const s = await seedSentRfpWithBid();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'b@x.com',
        workspaceId: randomUUID(),
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await cancelRfpAction({ rfpId: s.rfpCode });
    expect(r.ok).toBe(false);
  });

  it('rejects bad transition (already awarded)', async () => {
    const s = await seedSentRfpWithBid();
    await db
      .update(rfps)
      .set({ status: 'awarded' })
      .where(eq(rfps.id, s.rfpId));
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'b@x.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await cancelRfpAction({ rfpId: s.rfpCode });
    expect(r.ok).toBe(false);
  });

  it('rejects without buyer session', async () => {
    sessionRef.value = null;
    const r = await cancelRfpAction({ rfpId: 'P-2605-0010' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_BUYER');
  });
});
