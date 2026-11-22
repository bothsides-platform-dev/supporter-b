import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  instantPgChannels,
  instantPolicies,
  instantRequests,
  pgAgreementRates,
  pgMatchingPolicies,
  pgRecommendationGroups,
  workspaces,
} from '@/lib/db/schema';
import { emptyMatchingFees } from '@/lib/rfp/pg-matching';
import type { InstantPolicy } from '@/lib/rfp/instant-quote';
import { instantIntakeOpen, showInstantEntry } from '../instant-intake';

afterEach(teardownServerTestEnv);

const policy: InstantPolicy = {
  fees: [{ key: 'card:sole', rate: 0.012 }],
  terms: {
    insurance: { kind: 'none' },
    limit: { kind: 'none' },
    signupFee: { kind: 'none' },
    cycle: { days: 3, unit: 'business' },
  },
  direct: {},
  review: { cashConvertible: false, prices: [], sales: [], maxDeliveryDays: null },
  validityDays: 10,
  retryDays: 20,
  responseDays: 30,
  ackDays: 1,
  applicationDays: 3,
  resultDays: 7,
};
async function openPg(name = '나래결제') {
  const db = await setupServerTestEnv();
  const pg = await seedPgWorkspace(db, name),
    group = randomUUID();
  await db.insert(pgRecommendationGroups).values({ id: group, name: '의류' });
  const candidate = { pgWorkspaceId: pg.id, reason: '의류', feesByTier: emptyMatchingFees(), feeNote: '' };
  await db.insert(pgMatchingPolicies).values({ groupId: group, policy: { risk: 'white', candidates: [candidate] } });
  await db.insert(pgAgreementRates).values({ pgWsId: pg.id, rates: [{ key: 'card:sole', rate: 0.014 }] });
  await db.insert(instantPgChannels).values({
    pgId: pg.id,
    enabled: true,
    recipient: 'pg@example.test',
    signupUrl: 'https://pg.example.test/join',
  });
  await db.insert(instantPolicies).values({ groupId: group, pgId: pg.id, version: 1, policy });
  return { db, pg, group, candidate };
}

it('설정이 없으면 닫혀 있고, 관리자가 PG 접수를 열면 재배포 없이 열린다', async () => {
  await setupServerTestEnv();
  expect(await instantIntakeOpen()).toBe(false);
  teardownServerTestEnv();
  await openPg();
  expect(await instantIntakeOpen()).toBe(true);
});

it('견적을 낼 수 없는 PG는 접수가 켜져 있어도 흐름을 열지 않는다', async () => {
  const { db, pg, candidate } = await openPg();
  const expectOpen = async (value: boolean) => expect(await instantIntakeOpen()).toBe(value);
  const restore = { risk: 'white' as const, candidates: [candidate] };

  await db.update(instantPgChannels).set({ enabled: false });
  await expectOpen(false);
  await db.update(instantPgChannels).set({ enabled: true });

  await db.update(pgMatchingPolicies).set({ policy: { ...restore, risk: 'gray' } });
  await expectOpen(false);
  await db.update(pgMatchingPolicies).set({ policy: { ...restore, candidates: [] } });
  await expectOpen(false);
  await db.update(pgMatchingPolicies).set({ policy: restore });
  await expectOpen(true);

  await db.update(workspaces).set({ status: 'suspended' }).where(eq(workspaces.id, pg.id));
  await expectOpen(false);
  await db.update(workspaces).set({ status: 'active' }).where(eq(workspaces.id, pg.id));

  // 추천에서 빠지는 테스트 PG만 열려 있으면 방문자는 빈 견적만 보게 된다.
  await db.update(workspaces).set({ name: '나래결제 테스트' }).where(eq(workspaces.id, pg.id));
  await expectOpen(false);
});

it('구매사 링크는 접수가 열렸을 때, PG 링크는 자사 접수가 열렸을 때 보인다', async () => {
  const { db, pg } = await openPg();
  const user = await seedUser(db),
    buyer = await seedBuyerWorkspace(db),
    other = await seedPgWorkspace(db, '바다결제');
  expect(await showInstantEntry({ userId: user.id, workspaceId: buyer.id }, 'buyer')).toBe(true);
  expect(await showInstantEntry({ userId: user.id, workspaceId: pg.id }, 'pg')).toBe(true);
  expect(await showInstantEntry({ userId: user.id, workspaceId: other.id }, 'pg')).toBe(false);
});

it('접수를 닫아도 신청한 작성자에게는 목록 링크가 남는다', async () => {
  const { db } = await openPg();
  await db.update(instantPgChannels).set({ enabled: false });
  const creator = await seedUser(db),
    teammate = await seedUser(db),
    buyer = await seedBuyerWorkspace(db);
  expect(await showInstantEntry({ userId: creator.id, workspaceId: buyer.id }, 'buyer')).toBe(false);
  await db.insert(instantRequests).values({
    requestKey: randomUUID(),
    buyerId: buyer.id,
    creator: creator.id,
    input: {
      business: { bizNo: '1248100998', website: 'https://example.com' },
      groupId: null,
      customIndustry: '의류',
      products: '가방',
      contractType: 'new',
      expectedVolume: '10m',
      methods: ['card'],
      currentPgs: [],
    },
  });
  expect(await showInstantEntry({ userId: creator.id, workspaceId: buyer.id }, 'buyer')).toBe(true);
  expect(await showInstantEntry({ userId: teammate.id, workspaceId: buyer.id }, 'buyer')).toBe(false);
});
