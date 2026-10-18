// DrizzlePresenceAccessRepository.canObserve — pglite-backed contract.
//
// presence:ws:<V> subscribe-proxy ACL 의 관계 술어 단일 출처. signed observer
// workspace W를 기준으로 다음 중 하나면 허가한다:
//   (a) W === V (자기 브로드캐스트·팀 동료 점)
//   (b) W 와 V 사이에 대화 존재 (메시지 표면)
//   (c) W↔V 가 RFP 초대 쌍 (브리프·비드위저드·초대 관리·비교 표면)
//   (d) W↔V 가 **pending** 콜드피치 쌍 (RfpPendingRequests) — 거절은 영구,
//       rejected 는 절대 허가로 승격되면 안 된다 (봉인입찰 불변식과 같은 결).
// 전 절은 방향 대칭(구매사→PG, PG→구매사 모두)이다.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { chatConversations, rfpInvitations, rfpPgRequests } from '@/lib/db/schema';
import { DrizzlePresenceAccessRepository } from '../presence-access';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzlePresenceAccessRepository(db);
  const buyer = await seedBuyerWorkspace(db);
  const pg = await seedPgWorkspace(db, 'PG-1');
  const buyerUser = await seedUser(db);
  const pgUser = await seedUser(db);
  await seedMembership(db, buyer.id, buyerUser.id);
  await seedMembership(db, pg.id, pgUser.id);
  return { db, repo, buyer, pg, buyerUser, pgUser };
}

async function seedConversation(db: Awaited<ReturnType<typeof createPgliteDb>>, buyerWsId: string, pgWsId: string) {
  await db.insert(chatConversations).values({ buyerWsId, pgWsId });
}

async function seedInvitation(
  db: Awaited<ReturnType<typeof createPgliteDb>>,
  rfpId: string,
  pgWsId: string,
) {
  await db.insert(rfpInvitations).values({
    rfpId,
    pgWsId,
    tokenHash: `th-${randomUUID()}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });
}

describe('DrizzlePresenceAccessRepository.canObserve', () => {
  it('(a) 자기 워크스페이스는 관찰할 수 있다', async () => {
    const { repo, buyer } = await setup();
    expect(await repo.canObserve(buyer.id, buyer.id)).toBe(true);
  });

  it('(b) 대화 상대 워크스페이스를 양방향으로 관찰할 수 있다', async () => {
    const { db, repo, buyer, pg } = await setup();
    await seedConversation(db, buyer.id, pg.id);
    expect(await repo.canObserve(pg.id, buyer.id)).toBe(true);
    expect(await repo.canObserve(buyer.id, pg.id)).toBe(true);
  });

  it('(c) RFP 초대 쌍 워크스페이스를 양방향으로 관찰할 수 있다', async () => {
    const { db, repo, buyer, pg, buyerUser } = await setup();
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: buyerUser.id });
    await seedInvitation(db, rfp.id, pg.id);
    expect(await repo.canObserve(pg.id, buyer.id)).toBe(true);
    expect(await repo.canObserve(buyer.id, pg.id)).toBe(true);
  });

  it('(d) pending 콜드피치 쌍은 양방향으로 관찰할 수 있다', async () => {
    const { db, repo, buyer, pg, buyerUser, pgUser } = await setup();
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: buyerUser.id });
    await db.insert(rfpPgRequests).values({
      rfpId: rfp.id,
      pgWsId: pg.id,
      createdByUserId: pgUser.id,
    });
    expect(await repo.canObserve(buyer.id, pg.id)).toBe(true);
    expect(await repo.canObserve(pg.id, buyer.id)).toBe(true);
  });

  it('(d′) rejected 콜드피치는 관찰을 허가하지 않는다 — 거절은 영구', async () => {
    const { db, repo, buyer, pg, buyerUser, pgUser } = await setup();
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: buyerUser.id });
    await db.insert(rfpPgRequests).values({
      rfpId: rfp.id,
      pgWsId: pg.id,
      createdByUserId: pgUser.id,
      status: 'rejected',
    });
    expect(await repo.canObserve(buyer.id, pg.id)).toBe(false);
    expect(await repo.canObserve(pg.id, buyer.id)).toBe(false);
  });

  it('무관한 워크스페이스는 관찰할 수 없다', async () => {
    const { db, repo, buyer } = await setup();
    const otherPg = await seedPgWorkspace(db, 'PG-외부');
    expect(await repo.canObserve(otherPg.id, buyer.id)).toBe(false);
  });

  it('다른 소속 workspace 관계를 signed observer workspace로 끌어오지 않는다', async () => {
    const { db, repo, buyer } = await setup();
    const pg2 = await seedPgWorkspace(db, 'PG-2');
    const unrelated = await seedPgWorkspace(db, 'PG-3');
    await seedConversation(db, buyer.id, pg2.id);
    expect(await repo.canObserve(pg2.id, buyer.id)).toBe(true);
    expect(await repo.canObserve(unrelated.id, buyer.id)).toBe(false);
  });

  it('존재하지 않는 워크스페이스 쌍은 false (fail-closed)', async () => {
    const { repo } = await setup();
    expect(await repo.canObserve(randomUUID(), randomUUID())).toBe(false);
  });
});
