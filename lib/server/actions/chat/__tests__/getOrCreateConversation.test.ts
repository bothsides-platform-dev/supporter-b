import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { chatConversations, chatMessages } from '@/lib/db/schema';
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
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { getOrCreateConversationAction } from '../getOrCreateConversationAction';

let db: PgliteDB;

async function seedPair() {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '구매사담당' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'sales@pg.com', name: 'PG영업' });
  const pgWs = await seedPgWorkspace(db, 'PG', { name: 'OO페이' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  return { buyerUser, buyerWs, pgUser, pgWs };
}

function asBuyer(u: { id: string; email: string }, wsId: string) {
  sessionRef.value = {
    user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'buyer' },
  };
}

describe('getOrCreateConversationAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('대화가 없으면 생성하고 conversationId를 반환한다', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await getOrCreateConversationAction(pgWs.id);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conversationId).toMatch(/[0-9a-f-]{36}/);

    const convs = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, r.conversationId));
    expect(convs).toHaveLength(1);
    expect(convs[0].buyerWsId).toBe(buyerWs.id);
    expect(convs[0].pgWsId).toBe(pgWs.id);
  });

  it('이미 있으면 같은 conversationId를 반환한다 (멱등)', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const first = await getOrCreateConversationAction(pgWs.id);
    const second = await getOrCreateConversationAction(pgWs.id);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.conversationId).toBe(first.conversationId);
  });

  it('메시지를 전송하지 않는다 (메시지 0건 유지)', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await getOrCreateConversationAction(pgWs.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, r.conversationId));
    expect(msgs).toHaveLength(0);
  });

  it('상대가 같은 타입이면 INVALID_COUNTERPARTY로 거절한다', async () => {
    const { buyerUser, buyerWs } = await seedPair();
    const otherBuyerWs = await seedBuyerWorkspace(db, { name: '다른구매사' });
    asBuyer(buyerUser, buyerWs.id);

    const r = await getOrCreateConversationAction(otherBuyerWs.id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_COUNTERPARTY');
  });

  it('비로그인 시 UNAUTHENTICATED를 반환한다', async () => {
    sessionRef.value = null;
    const r = await getOrCreateConversationAction('00000000-0000-0000-0000-000000000000');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('UNAUTHENTICATED');
  });
});
