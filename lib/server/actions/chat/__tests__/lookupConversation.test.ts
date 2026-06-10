// lookupConversationAction — 읽기 전용 wsId→conversationId 해소.
//
// 채팅 레일이 열람·포커스 추종만으로 빈 페어 대화를 생성하면 상대 PG 인박스에
// "구매사가 보고 있다"는 신호가 새므로(sealed-bid), 레일의 표시는 이 조회만
// 쓰고 생성은 첫 메시지 전송(sendChatMessageAction)에 맡긴다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatConversations } from '@/lib/db/schema';
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
import { lookupConversationAction } from '../lookupConversationAction';

let db: PgliteDB;

async function seedPair() {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'pg@p.com' });
  const pgWs = await seedPgWorkspace(db, 'OO페이');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  return { buyerUser, buyerWs, pgUser, pgWs };
}

function asBuyer(u: { id: string; email: string }, wsId: string) {
  sessionRef.value = {
    user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'buyer' },
  };
}

describe('lookupConversationAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('대화가 없으면 conversationId null — 행을 생성하지 않는다', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await lookupConversationAction(pgWs.id);
    expect(r).toEqual({ ok: true, conversationId: null });

    const rows = await db.select().from(chatConversations);
    expect(rows).toHaveLength(0);
  });

  it('기존 대화가 있으면 그 id 를 돌려준다', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const created = await getOrCreateConversationAction(pgWs.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const r = await lookupConversationAction(pgWs.id);
    expect(r).toEqual({ ok: true, conversationId: created.conversationId });
  });

  it('PG 세션은 buyer 상대를 같은 페어로 해소한다', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const created = await getOrCreateConversationAction(pgWs.id);
    if (!created.ok) throw new Error('seed failed');

    sessionRef.value = {
      user: { id: pgUser.id, email: 'pg@p.com', workspaceId: pgWs.id, workspaceType: 'pg' },
    };
    const r = await lookupConversationAction(buyerWs.id);
    expect(r).toEqual({ ok: true, conversationId: created.conversationId });
  });

  it('상대가 같은 타입이면 INVALID_COUNTERPARTY', async () => {
    const { buyerUser, buyerWs } = await seedPair();
    const otherBuyer = await seedBuyerWorkspace(db);
    asBuyer(buyerUser, buyerWs.id);
    expect(await lookupConversationAction(otherBuyer.id)).toEqual({
      ok: false,
      error: 'INVALID_COUNTERPARTY',
    });
  });

  it('비로그인 UNAUTHENTICATED / 비uuid INVALID_INPUT', async () => {
    sessionRef.value = null;
    expect(
      await lookupConversationAction('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ).toEqual({ ok: false, error: 'UNAUTHENTICATED' });

    const { buyerUser, buyerWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    expect(await lookupConversationAction('not-a-uuid')).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
  });
});
