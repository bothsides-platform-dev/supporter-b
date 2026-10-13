// N+1 regression guard at the SQL level.
//
// conversationLoaders.test.ts counts *repo method* calls, which cannot see a
// loop hidden INSIDE a repo method (e.g. a findByIds that iterates). This
// counts actual statements at the PGlite driver, so it pins the real round
// trips. Both guards are cheap; only this one would catch a repo regressing
// internally.
//
// The RFP-linked cases also exercise distinct awarded bids, so memoizing a
// per-RFP or per-winner lookup cannot hide an N+1 regression.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bids, chatConversations, chatMessages, rfpInvitations, rfps } from '@/lib/db/schema';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
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
  requireBuyerSession: () => Promise.resolve(sessionRef.value),
  requirePgSession: () => Promise.resolve(sessionRef.value),
}));

import { sendChatMessageAction } from '../sendChatMessageAction';
import { listConversationsForViewer, type ConversationListItem } from '../conversationLoaders';

let db: PgliteDB;

/** One buyer with `n` PG counterparties, each conversation holding 5 messages. */
async function seedConversations(n: number, messagesEach: number) {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: 'B' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  for (let i = 0; i < n; i++) {
    const pgUser = await seedUser(db, { email: `pg${i}@pg.com`, name: `P${i}` });
    const pgWs = await seedPgWorkspace(db, `PG${i}`, { name: `페이${i}` });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');
    sessionRef.value = {
      user: {
        id: pgUser.id,
        email: pgUser.email,
        workspaceId: pgWs.id,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    for (let k = 0; k < messagesEach; k++) {
      await sendChatMessageAction({ counterpartyWorkspaceId: buyerWs.id, body: `m${i}-${k}` });
    }
  }
  sessionRef.value = {
    user: {
      id: buyerUser.id,
      email: buyerUser.email,
      workspaceId: buyerWs.id,
      workspaceType: 'buyer',
      role: 'admin',
    },
  };
}

/** Distinct RFP + awarded bid per conversation, alternating selected/closed PGs. */
async function seedAwardedConversations(n: number, viewerType: 'buyer' | 'pg') {
  const viewer = await seedUser(db, { email: 'viewer@example.com' });
  const viewerWs = viewerType === 'buyer'
    ? await seedBuyerWorkspace(db)
    : await seedPgWorkspace(db, '뷰어 PG');
  await seedMembership(db, viewerWs.id, viewer.id, 'admin');
  const expected: ConversationListItem[] = [];

  for (let i = 0; i < n; i++) {
    const counterparty = await seedUser(db, { email: `counterparty-${i}@example.com` });
    const counterpartyName = `상대 회사 ${i}`;
    const counterpartyWs = viewerType === 'buyer'
      ? await seedPgWorkspace(db, counterpartyName)
      : await seedBuyerWorkspace(db, { name: counterpartyName });
    await seedMembership(db, counterpartyWs.id, counterparty.id, 'admin');
    const buyerWsId = viewerType === 'buyer' ? viewerWs.id : counterpartyWs.id;
    const buyerUserId = viewerType === 'buyer' ? viewer.id : counterparty.id;
    const pgWsId = viewerType === 'pg' ? viewerWs.id : counterpartyWs.id;
    const pgUserId = viewerType === 'pg' ? viewer.id : counterparty.id;
    const closedAfterAward = i % 2 === 1;
    const winner = closedAfterAward
      ? await seedUser(db, { email: `sealed-winner-${i}@example.com` })
      : { id: pgUserId };
    const winnerWs = closedAfterAward
      ? await seedPgWorkspace(db, `비공개 선정 PG ${i}`)
      : { id: pgWsId };
    if (closedAfterAward) await seedMembership(db, winnerWs.id, winner.id, 'admin');

    const rfp = await seedRfp(db, { buyerWsId, createdBy: buyerUserId });
    const invitationId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invitationId,
      rfpId: rfp.id,
      pgWsId: winnerWs.id,
      tokenHash: randomUUID(),
      sentAt: new Date('2026-10-01T00:00:00Z'),
      expiresAt: new Date('2026-10-30T00:00:00Z'),
      status: 'accepted',
    });
    const bidId = randomUUID();
    await db.insert(bids).values({
      id: bidId,
      rfpId: rfp.id,
      pgWsId: winnerWs.id,
      invitationId,
      settleCycle: 'D+1',
      submittedBy: winner.id,
      memo: `비공개 선정 견적 ${i}`,
    });
    const deadline = '2026-10-30T09:00:00.000Z';
    await db.update(rfps).set({
      title: `견적 요청 ${i}`,
      status: 'awarded',
      awardedBidId: bidId,
      deadline: new Date(deadline),
    }).where(eq(rfps.id, rfp.id));

    const conversationId = randomUUID();
    const lastMessageAt = new Date(Date.UTC(2026, 9, 13, 0, i)).toISOString();
    await db.insert(chatConversations).values({
      id: conversationId, buyerWsId, pgWsId, lastMessageAt: new Date(lastMessageAt),
    });
    await db.insert(chatMessages).values({
      id: randomUUID(),
      conversationId,
      authorUserId: counterparty.id,
      authorWsId: counterpartyWs.id,
      body: `견적 문의 ${i}`,
      rfpId: rfp.id,
      createdAt: new Date(lastMessageAt),
    });
    // Exact public payload: adding the winner's identity, bid, or financial
    // fields fails even if SQL counts stay constant.
    expected.unshift({
      conversationId,
      counterparty: {
        workspaceId: counterpartyWs.id,
        name: counterpartyName,
        type: viewerType === 'buyer' ? 'pg' : 'buyer',
        logoUpdatedAt: null,
      },
      rfpId: rfp.id,
      rfpCode: rfp.code,
      rfpTitle: `견적 요청 ${i}`,
      rfpStatus: 'awarded',
      rfpDeadline: deadline,
      preview: `견적 문의 ${i}`,
      lastMessageAt,
      unread: true,
      closedAfterAward,
    });
  }
  sessionRef.value = {
    user: {
      id: viewer.id, email: viewer.email, workspaceId: viewerWs.id,
      workspaceType: viewerType, role: 'admin',
    },
  };
  return expected;
}

/** Captures SQL at the real driver, including queries hidden inside a repo. */
async function traceSql<T>(fn: () => Promise<T>): Promise<{ value: T; statements: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (db as any).$client;
  if (!client?.query) throw new Error('drizzle $client unavailable — cannot count SQL');
  const statements: string[] = [];
  const origQuery = client.query.bind(client);
  const origExec = client.exec?.bind(client);
  client.query = (...args: unknown[]) => {
    statements.push(String(args[0]));
    return origQuery(...args);
  };
  if (origExec) {
    client.exec = (...args: unknown[]) => {
      statements.push(String(args[0]));
      return origExec(...args);
    };
  }
  try {
    return { value: await fn(), statements };
  } finally {
    client.query = origQuery;
    if (origExec) client.exec = origExec;
  }
}

describe('listConversationsForViewer — real SQL round trips', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('issues the same number of SQL statements for 3 conversations as for 30', async () => {
    await seedConversations(3, 5);
    const three = await traceSql(() => listConversationsForViewer());

    teardownRfpActionEnv();
    db = await setupRfpActionEnv();

    await seedConversations(30, 5);
    const thirty = await traceSql(() => listConversationsForViewer());

    expect(three.statements.length).toBeGreaterThan(0);
    expect(thirty.statements.length).toBe(three.statements.length);
  });

  it('does not scale with the number of messages in a conversation either', async () => {
    // The old loader pulled every message of every conversation to read the
    // last one, so it grew on this axis too — not just conversation count.
    await seedConversations(3, 2);
    const few = await traceSql(() => listConversationsForViewer());

    teardownRfpActionEnv();
    db = await setupRfpActionEnv();

    await seedConversations(3, 20);
    const many = await traceSql(() => listConversationsForViewer());

    expect(many.statements.length).toBe(few.statements.length);
  });

  it.each(['buyer', 'pg'] as const)(
    '%s: distinct awarded RFPs keep SQL flat from 3 to 30 conversations without exposing winners',
    async (viewerType) => {
      const expectedThree = await seedAwardedConversations(3, viewerType);
      const three = await traceSql(() => listConversationsForViewer());
      expect(three.value).toEqual(expectedThree);

      teardownRfpActionEnv();
      db = await setupRfpActionEnv();

      const expectedThirty = await seedAwardedConversations(30, viewerType);
      const thirty = await traceSql(() => listConversationsForViewer());
      expect(thirty.value).toEqual(expectedThirty);

      // No-RFP fixtures bypass both queries entirely. Require real SELECTs
      // from these tables so an empty fixture cannot make this guard pass.
      for (const table of ['rfps', 'bids']) {
        const selects = (statements: string[]) => statements.filter(
          (sql) => new RegExp(`\\bfrom "${table}"`).test(sql),
        );
        expect(selects(three.statements).length, `${table} SELECTs`).toBeGreaterThan(0);
        expect(selects(thirty.statements).length, `${table} SELECTs`)
          .toBe(selects(three.statements).length);
      }
      expect(thirty.statements.length).toBe(three.statements.length);
    },
  );
});
