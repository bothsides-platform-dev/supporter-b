// getUserProfileAction — 세션 검증 + uuid 파싱 후 ACL 로더(loadUserProfileForViewer)에 위임.
// 실제 PGlite + 실제 로더로 돌리고 세션만 모킹한다(lookupConversation.test 컨벤션).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getChatConversationRepo } from '@/lib/server/repositories/factory';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessionUser = {
  id: string;
  email: string;
  workspaceId?: string;
  workspaceType?: 'buyer' | 'pg';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { getUserProfileAction } from '../getUserProfileAction';

let db: PgliteDB;

async function seedScenario() {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '구매 담당자' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'pg@p.com', name: '영업 담당자' });
  const pgWs = await seedPgWorkspace(db, 'OO페이');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  // stranger PG — no conversation
  const stranger = await seedUser(db, { email: 's@x.com' });
  const strangerWs = await seedPgWorkspace(db, 'XX페이');
  await seedMembership(db, strangerWs.id, stranger.id, 'member');
  await (await getChatConversationRepo()).findOrCreatePair(buyerWs.id, pgWs.id);
  return { buyerUser, buyerWs, pgUser, pgWs, stranger };
}

function asBuyer(u: { id: string; email: string }, wsId: string) {
  sessionRef.value = {
    user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'buyer' },
  };
}

describe('getUserProfileAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    sessionRef.value = null;
  });
  afterEach(() => {
    teardownRfpActionEnv();
    vi.clearAllMocks();
  });

  it('미인증이면 ok:false', async () => {
    const res = await getUserProfileAction(randomUUID());
    expect(res.ok).toBe(false);
  });

  it('인증됐지만 활성 워크스페이스가 없으면 NO_WORKSPACE', async () => {
    sessionRef.value = { user: { id: 'u-x', email: 'x@x.com' } }; // no workspaceId/type
    const res = await getUserProfileAction(randomUUID());
    expect(res).toEqual({ ok: false, error: 'NO_WORKSPACE' });
  });

  it('uuid 가 아니면 INVALID_INPUT', async () => {
    const { buyerUser, buyerWs } = await seedScenario();
    asBuyer(buyerUser, buyerWs.id);
    const res = await getUserProfileAction('not-a-uuid');
    expect(res).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('대화 상대 PG 담당자 → ok:true + counterparty 프로필', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedScenario();
    asBuyer(buyerUser, buyerWs.id);
    const res = await getUserProfileAction(pgUser.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profile.relationship).toBe('counterparty');
    expect(res.profile.email).toBe('pg@p.com');
    expect(res.profile.workspace?.id).toBe(pgWs.id);
  });

  it('무관계 유저 → ok:false (이메일 비노출)', async () => {
    const { buyerUser, buyerWs, stranger } = await seedScenario();
    asBuyer(buyerUser, buyerWs.id);
    const res = await getUserProfileAction(stranger.id);
    expect(res.ok).toBe(false);
  });
});
