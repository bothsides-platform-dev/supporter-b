// DrizzlePresenceAccessRepository.canObserve — pglite-backed contract.
//
// presence:ws:<V> subscribe-proxy ACL 의 관계 술어 단일 출처. 허가 = 다음 중 하나:
//   (a) U 가 V 의 멤버 (자기 브로드캐스트·팀 동료 점)
//   (b) U 의 어느 워크스페이스 W 와 V 사이에 대화 존재 (메시지 표면)
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
  it('(a) 자기 워크스페이스 멤버는 관찰할 수 있다', async () => {
    const { repo, buyer, buyerUser } = await setup();
    expect(await repo.canObserve(buyerUser.id, buyer.id)).toBe(true);
  });

  it('(b) 대화 상대 워크스페이스를 양방향으로 관찰할 수 있다', async () => {
    const { db, repo, buyer, pg, buyerUser, pgUser } = await setup();
    await seedConversation(db, buyer.id, pg.id);
    expect(await repo.canObserve(pgUser.id, buyer.id)).toBe(true);
    expect(await repo.canObserve(buyerUser.id, pg.id)).toBe(true);
  });

  it('(c) RFP 초대 쌍 워크스페이스를 양방향으로 관찰할 수 있다', async () => {
    const { db, repo, buyer, pg, buyerUser, pgUser } = await setup();
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: buyerUser.id });
    await seedInvitation(db, rfp.id, pg.id);
    expect(await repo.canObserve(pgUser.id, buyer.id)).toBe(true);
    expect(await repo.canObserve(buyerUser.id, pg.id)).toBe(true);
  });

  it('(d) pending 콜드피치 쌍은 양방향으로 관찰할 수 있다', async () => {
    const { db, repo, buyer, pg, buyerUser, pgUser } = await setup();
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: buyerUser.id });
    await db.insert(rfpPgRequests).values({
      rfpId: rfp.id,
      pgWsId: pg.id,
      createdByUserId: pgUser.id,
    });
    expect(await repo.canObserve(buyerUser.id, pg.id)).toBe(true);
    expect(await repo.canObserve(pgUser.id, buyer.id)).toBe(true);
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
    expect(await repo.canObserve(buyerUser.id, pg.id)).toBe(false);
    expect(await repo.canObserve(pgUser.id, buyer.id)).toBe(false);
  });

  it('무관한 사용자는 관찰할 수 없다', async () => {
    const { db, repo, buyer } = await setup();
    const outsider = await seedUser(db);
    const otherPg = await seedPgWorkspace(db, 'PG-외부');
    await seedMembership(db, otherPg.id, outsider.id);
    expect(await repo.canObserve(outsider.id, buyer.id)).toBe(false);
  });

  it('활성 워크스페이스가 아니어도 소속 워크스페이스 경유 관계면 허가한다', async () => {
    const { db, repo, buyer } = await setup();
    // multiWsUser 는 pg2 소속이고, pg2 가 buyer 와 대화 중 — 어느 멤버십이
    // "활성"인지는 프록시가 알 수 없으므로 전체 멤버십 기준으로 판정해야 한다.
    const pg2 = await seedPgWorkspace(db, 'PG-2');
    const multiWsUser = await seedUser(db);
    await seedMembership(db, pg2.id, multiWsUser.id);
    await seedConversation(db, buyer.id, pg2.id);
    expect(await repo.canObserve(multiWsUser.id, buyer.id)).toBe(true);
  });

  it('존재하지 않는 사용자/워크스페이스는 false (fail-closed)', async () => {
    const { repo } = await setup();
    expect(await repo.canObserve(randomUUID(), randomUUID())).toBe(false);
  });
});
