import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  bids,
  contracts,
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
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { awardRfpAction } from '../awardRfpAction';

let db: PgliteDB;

type Setup = {
  buyerUserId: string;
  buyerWsId: string;
  bizId: string;
  rfpId: string;
  rfpCode: string;
  winnerWsId: string;
  winnerUserIds: string[];
  loserAWsId: string;
  loserAUserIds: string[];
  loserBWsId: string;
  loserBUserIds: string[];
  winnerBidId: string;
  loserABidId: string;
  loserBBidId: string;
};

async function seedAwardSetup(): Promise<Setup> {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  // Three PG workspaces with two members each — to test fan-out.
  const winnerWs = await seedPgWorkspace(db, 'toss.im');
  const w1 = await seedUser(db, { email: 'w1@toss.im' });
  const w2 = await seedUser(db, { email: 'w2@toss.im' });
  await seedMembership(db, winnerWs.id, w1.id, 'admin');
  await seedMembership(db, winnerWs.id, w2.id, 'member');

  const loserAWs = await seedPgWorkspace(db, 'inicis.com');
  const la1 = await seedUser(db, { email: 'la1@inicis.com' });
  const la2 = await seedUser(db, { email: 'la2@inicis.com' });
  await seedMembership(db, loserAWs.id, la1.id);
  await seedMembership(db, loserAWs.id, la2.id);

  const loserBWs = await seedPgWorkspace(db, 'kakaopay.com');
  const lb1 = await seedUser(db, { email: 'lb1@kakaopay.com' });
  await seedMembership(db, loserBWs.id, lb1.id);

  // Sent RFP.
  const rfpId = randomUUID();
    const rfpCode = 'P-2605-0001';
  await db.insert(rfps).values({
    id: rfpId,
    code: rfpCode,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'award test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });
  // Need an invitation row + bid row per PG. invitationId is required FK.
  async function seedBid(pgWsId: string, _email: string): Promise<string> {
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId,
      rfpId,
      pgWsId,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });
    const bidId = randomUUID();
    await db.insert(bids).values({
      id: bidId,
      rfpId,
      pgWsId,
      invitationId: invId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: w1.id,
      submittedAt: new Date(),
    });
    return bidId;
  }
  const winnerBidId = await seedBid(winnerWs.id, 'w1@toss.im');
  const loserABidId = await seedBid(loserAWs.id, 'la1@inicis.com');
  const loserBBidId = await seedBid(loserBWs.id, 'lb1@kakaopay.com');

  return {
    buyerUserId: buyer.id,
    buyerWsId: buyerWs.id,
    bizId: biz.id,
    rfpId,
    rfpCode,
    winnerWsId: winnerWs.id,
    winnerUserIds: [w1.id, w2.id],
    loserAWsId: loserAWs.id,
    loserAUserIds: [la1.id, la2.id],
    loserBWsId: loserBWs.id,
    loserBUserIds: [lb1.id],
    winnerBidId,
    loserABidId,
    loserBBidId,
  };
}

describe('awardRfpAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without buyer session', async () => {
    const s = await seedAwardSetup();
    sessionRef.value = null;
    const r = await awardRfpAction({
      rfpId: s.rfpId,
      awardedBidId: s.winnerBidId,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects when caller is not the buyer ws (ownership)', async () => {
    const s = await seedAwardSetup();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@x.com',
        // Different workspace id — not the RFP's buyerWsId.
        workspaceId: randomUUID(),
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await awardRfpAction({
      rfpId: s.rfpId,
      awardedBidId: s.winnerBidId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN_BUYER');
  });

  it('flips status to awarded + writes contracts row + sets awardedBidId', async () => {
    const s = await seedAwardSetup();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@x.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await awardRfpAction({
      rfpId: s.rfpId,
      awardedBidId: s.winnerBidId,
    });
    expect(r.ok).toBe(true);

    const [row] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(row.status).toBe('awarded');
    expect(row.awardedBidId).toBe(s.winnerBidId);

    const [c] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.rfpId, s.rfpId));
    expect(c).toBeDefined();
    expect(c.bidId).toBe(s.winnerBidId);
    expect(c.awardedBy).toBe(s.buyerUserId);
  });

  it('asymmetry — winner gets in-app notifications + outbox emails per member; losers get in-app only (no outbox)', async () => {
    const s = await seedAwardSetup();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@x.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await awardRfpAction({
      rfpId: s.rfpId,
      awardedBidId: s.winnerBidId,
    });
    expect(r.ok).toBe(true);

    // — winner: in-app notification per member of winner ws
    const winnerNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, s.winnerWsId),
          eq(notifications.type, 'rfp.awarded'),
        ),
      );
    expect(winnerNotifs.map((n) => n.userId).sort()).toEqual(
      [...s.winnerUserIds].sort(),
    );
    for (const n of winnerNotifs) {
      expect(n.channel).toBe('in_app');
    }

    // — winner: outbox per winner-member email
    const awardedOutbox = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.awarded'));
    expect(awardedOutbox).toHaveLength(s.winnerUserIds.length);
    expect(awardedOutbox.map((o) => o.toAddr).sort()).toEqual(
      ['w1@toss.im', 'w2@toss.im'].sort(),
    );

    // — losers: in-app rejection notifications per member of each loser ws
    const loserNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'rfp.rejected'));
    const expectedLoserUsers = [...s.loserAUserIds, ...s.loserBUserIds];
    expect(loserNotifs.map((n) => n.userId).sort()).toEqual(
      expectedLoserUsers.sort(),
    );
    for (const n of loserNotifs) {
      expect(n.channel).toBe('in_app');
    }

    // 🚨 advisor pin 6 — losers get NO outbox emails. The only rfp.awarded
    // outbox rows are for the winner. There is no rfp.rejected event on the
    // outbox enum, so checking by recipient is enough.
    const loserEmailRecipients = [
      'la1@inicis.com',
      'la2@inicis.com',
      'lb1@kakaopay.com',
    ];
    const allOutboxToLosers = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.awarded'));
    expect(
      allOutboxToLosers.every((o) => !loserEmailRecipients.includes(o.toAddr)),
    ).toBe(true);
  });

  it('winner/loser notifications link to /inbox/<code> and title shows the code, not the uuid', async () => {
    const s = await seedAwardSetup();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@x.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await awardRfpAction({
      rfpId: s.rfpId,
      awardedBidId: s.winnerBidId,
    });
    expect(r.ok).toBe(true);

    // Award + reject notifications both point PG members at their inbox; the
    // inbox route resolves by human code, so the link must carry the code.
    const all = await db.select().from(notifications);
    const awardRelated = all.filter(
      (n) => n.type === 'rfp.awarded' || n.type === 'rfp.rejected',
    );
    expect(awardRelated.length).toBeGreaterThan(0);
    for (const n of awardRelated) {
      expect(n.linkUrl).toBe(`/inbox/${s.rfpCode}`);
      expect(n.title).toContain(s.rfpCode);
      expect(n.linkUrl).not.toContain(s.rfpId);
      expect(n.title).not.toContain(s.rfpId);
    }
  });

  it('rejects bad transition (e.g. RFP already awarded)', async () => {
    const s = await seedAwardSetup();
    // Pre-award.
    await db
      .update(rfps)
      .set({ status: 'awarded', awardedBidId: s.winnerBidId })
      .where(eq(rfps.id, s.rfpId));

    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@x.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await awardRfpAction({
      rfpId: s.rfpId,
      awardedBidId: s.winnerBidId,
    });
    expect(r.ok).toBe(false);
  });
});
