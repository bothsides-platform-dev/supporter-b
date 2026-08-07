// N+1 regression guard at the SQL level.
//
// conversationLoaders.test.ts counts *repo method* calls, which cannot see a
// loop hidden INSIDE a repo method (e.g. a findByIds that iterates). This
// counts actual statements at the PGlite driver, so it pins the real round
// trips. Both guards are cheap; only this one would catch a repo regressing
// internally.
//
// Measured on the implementation this replaced: 3 conversations → 16
// statements, 30 → 151. Now 4 and 4.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
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
import { listConversationsForViewer } from '../conversationLoaders';

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

/** Counts SQL statements issued while `fn` runs, by wrapping the PGlite client. */
async function countSql(fn: () => Promise<unknown>): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (db as any).$client;
  if (!client?.query) throw new Error('drizzle $client unavailable — cannot count SQL');
  let n = 0;
  const origQuery = client.query.bind(client);
  const origExec = client.exec?.bind(client);
  client.query = (...args: unknown[]) => {
    n += 1;
    return origQuery(...args);
  };
  if (origExec) {
    client.exec = (...args: unknown[]) => {
      n += 1;
      return origExec(...args);
    };
  }
  try {
    await fn();
  } finally {
    client.query = origQuery;
    if (origExec) client.exec = origExec;
  }
  return n;
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
    const three = await countSql(() => listConversationsForViewer());

    teardownRfpActionEnv();
    db = await setupRfpActionEnv();

    await seedConversations(30, 5);
    const thirty = await countSql(() => listConversationsForViewer());

    expect(three).toBeGreaterThan(0);
    expect(thirty).toBe(three);
  });

  it('does not scale with the number of messages in a conversation either', async () => {
    // The old loader pulled every message of every conversation to read the
    // last one, so it grew on this axis too — not just conversation count.
    await seedConversations(3, 2);
    const few = await countSql(() => listConversationsForViewer());

    teardownRfpActionEnv();
    db = await setupRfpActionEnv();

    await seedConversations(3, 20);
    const many = await countSql(() => listConversationsForViewer());

    expect(many).toBe(few);
  });
});
