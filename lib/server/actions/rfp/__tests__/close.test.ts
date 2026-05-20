import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  bids,
  notifications,
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

import { closeRfpAction } from '../closeRfpAction';

let db: PgliteDB;

describe('closeRfpAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('flips status to closed + in-app notification only', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    const pgWs = await seedPgWorkspace(db, 'toss.im');
    const pgUser = await seedUser(db, { email: 'pg@toss.im' });
    await seedMembership(db, pgWs.id, pgUser.id);
    const rfpId = randomUUID();
    const rfpCode = 'P-2605-0020';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'close test',
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
      deposit: '0',
      setupFee: '0',
      monthlyMin: '0',
      bankTransferFeePct: '0',
      easyPayFeePct: '0',
      status: 'submitted',
      submittedBy: pgUser.id,
      submittedAt: new Date(),
    });

    sessionRef.value = {
      user: {
        id: buyer.id,
        email: 'b@x.com',
        workspaceId: buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await closeRfpAction({ rfpId });
    expect(r.ok).toBe(true);

    const [row] = await db.select().from(rfps).where(eq(rfps.id, rfpId));
    expect(row.status).toBe('closed');

    const ns = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'rfp.closed'));
    expect(ns).toHaveLength(1);
    expect(ns[0].userId).toBe(pgUser.id);
    expect(ns[0].channel).toBe('in_app');
  });

  it('rejects ownership mismatch', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    const rfpId = randomUUID();
    const rfpCode = 'P-2605-0021';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'x',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
    sessionRef.value = {
      user: {
        id: buyer.id,
        email: 'b@x.com',
        workspaceId: randomUUID(),
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await closeRfpAction({ rfpId });
    expect(r.ok).toBe(false);
  });
});
