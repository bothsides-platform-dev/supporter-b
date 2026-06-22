// user-profile-loader — 아바타 클릭 신원 카드용 ACL 로더.
// 관계(self/teammate/counterparty)를 fail-closed 로 판정하고, 무관계면 이메일·존재를
// 노출하지 않는다(ok:false). 컨벤션: rfp-detail-loader.test.ts 와 동일 — pglite + seed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getChatConversationRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { loadUserProfileForViewer } from '../user-profile-loader';

let ctx: Awaited<ReturnType<typeof setup>>;

async function setup() {
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);

  // Buyer side
  const buyerUser = await seedUser(db, { email: 'buyer@buy.com', name: '구매 담당자' });
  const buyerMate = await seedUser(db, { email: 'mate@buy.com', name: '구매 동료' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  await seedMembership(db, buyerWs.id, buyerMate.id, 'member');

  // PG side that HAS a conversation with the buyer (counterparty)
  const pgUser = await seedUser(db, { email: 'sales@toss.im', name: '토스 영업' });
  const pgWs = await seedPgWorkspace(db, 'toss.im', { name: '토스페이먼츠' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  // PG side that has NO conversation with the buyer (stranger)
  const strangerUser = await seedUser(db, { email: 'x@inicis.com', name: '이니시스 영업' });
  const strangerWs = await seedPgWorkspace(db, 'inicis.com', { name: '이니시스' });
  await seedMembership(db, strangerWs.id, strangerUser.id, 'member');

  // Open a conversation buyerWs ↔ pgWs (but NOT to strangerWs).
  await (await getChatConversationRepo()).findOrCreatePair(buyerWs.id, pgWs.id);

  return { db, buyerUser, buyerMate, buyerWs, pgUser, pgWs, strangerUser, strangerWs };
}

const buyerActor = () => ({
  userId: ctx.buyerUser.id,
  workspaceId: ctx.buyerWs.id,
  workspaceType: 'buyer' as const,
});

beforeEach(async () => {
  ctx = await setup();
});

afterEach(async () => {
  await __resetForTest();
});

describe('loadUserProfileForViewer', () => {
  it('self — 본인을 보면 relationship=self, 워크스페이스(메시지) 없음, 본인 ws 가 presence 채널', async () => {
    const res = await loadUserProfileForViewer(buyerActor(), ctx.buyerUser.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profile.relationship).toBe('self');
    expect(res.profile.email).toBe('buyer@buy.com');
    expect(res.profile.presenceWorkspaceId).toBe(ctx.buyerWs.id);
    expect(res.profile.workspace).toBeUndefined();
  });

  it('teammate — 같은 워크스페이스 동료면 relationship=teammate, 메시지 워크스페이스 없음', async () => {
    const res = await loadUserProfileForViewer(buyerActor(), ctx.buyerMate.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profile.relationship).toBe('teammate');
    expect(res.profile.name).toBe('구매 동료');
    expect(res.profile.email).toBe('mate@buy.com');
    expect(res.profile.presenceWorkspaceId).toBe(ctx.buyerWs.id);
    expect(res.profile.workspace).toBeUndefined();
  });

  it('counterparty — 대화가 있는 상대 PG 의 담당자면 relationship=counterparty + 상대 ws 정보', async () => {
    const res = await loadUserProfileForViewer(buyerActor(), ctx.pgUser.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profile.relationship).toBe('counterparty');
    expect(res.profile.email).toBe('sales@toss.im');
    expect(res.profile.presenceWorkspaceId).toBe(ctx.pgWs.id);
    expect(res.profile.workspace).toEqual({
      id: ctx.pgWs.id,
      name: '토스페이먼츠',
      type: 'pg',
      logoUpdatedAt: null,
    });
  });

  it('counterparty (PG→Buyer 방향도 대칭) — PG 가 대화 상대 구매사 담당자를 보면 counterparty', async () => {
    const pgActor = {
      userId: ctx.pgUser.id,
      workspaceId: ctx.pgWs.id,
      workspaceType: 'pg' as const,
    };
    const res = await loadUserProfileForViewer(pgActor, ctx.buyerUser.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profile.relationship).toBe('counterparty');
    expect(res.profile.workspace?.id).toBe(ctx.buyerWs.id);
    expect(res.profile.workspace?.type).toBe('buyer');
  });

  it('시스템/마스터 계정은 대화 상대 워크스페이스 멤버여도 ok:false (전 멤버 표면 숨김 불변식)', async () => {
    // 시드된 canonical PG/데모 워크스페이스의 admin 은 isSystemAccount=true 인 실제 멤버다.
    // 다른 멤버 조회는 모두 시스템 계정을 거른다 — 이 신원 로더도 같아야 한다(이메일 비노출).
    const sysUser = await seedUser(ctx.db, {
      email: 'ops@supporter-b.com',
      name: '운영자',
      isSystemAccount: true,
    });
    await seedMembership(ctx.db, ctx.pgWs.id, sysUser.id, 'admin');
    const res = await loadUserProfileForViewer(buyerActor(), sysUser.id);
    expect(res.ok).toBe(false);
  });

  it('무관계 — 대화 없는 다른 PG 담당자는 ok:false (이메일/존재 비노출)', async () => {
    const res = await loadUserProfileForViewer(buyerActor(), ctx.strangerUser.id);
    expect(res.ok).toBe(false);
  });

  it('존재하지 않는 userId 도 ok:false (존재 여부 비노출)', async () => {
    const res = await loadUserProfileForViewer(buyerActor(), randomUUID());
    expect(res.ok).toBe(false);
  });
});
