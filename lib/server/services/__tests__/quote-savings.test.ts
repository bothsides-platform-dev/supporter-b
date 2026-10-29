import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { pgMatchingPolicies, pgRecommendationGroups, pgAgreementRates } from '@/lib/db/schema';
import { emptyMatchingFees } from '@/lib/rfp/pg-matching';
import { getGuestDraftService } from '../guest-drafts';
import { getQuoteSavingsService } from '../quote-savings';
let db: Awaited<ReturnType<typeof setupServerTestEnv>>;
let id: string, pgId: string, otherId: string, group: string;
beforeEach(async () => {
  db = await setupServerTestEnv();
  vi.stubGlobal('fetch', () => { throw new Error('AI prohibited'); });
  pgId = (await seedPgWorkspace(db, 'Alpha')).id;
  otherId = (await seedPgWorkspace(db, 'Beta')).id;
  group = randomUUID();
  await db.insert(pgRecommendationGroups).values({ id: group, name: '의류' });
  await db.insert(pgMatchingPolicies).values({ groupId: group, policy: { risk: 'white', candidates: [pgId, otherId].map((pgWorkspaceId, index) => ({
    pgWorkspaceId, reason: '의류 상담', feeNote: '부가세 별도, 심사 후 확정', feesByTier: { ...emptyMatchingFees(), sole: 1 + index, sme1: 2 + index },
  })) } });
  await db.insert(pgAgreementRates).values([pgId, otherId].map(pgWsId => ({ pgWsId, rates: [{ key: 'card:sole', rate: .03 }] })));
  id = randomUUID();
  await (await getGuestDraftService()).savePublic({ id, revision: 0, answers: { industryGroupId: group, contractType: 'new' }, files: [] }, 'proof');
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await teardownServerTestEnv(); });
it('서버의 첫 추천 PG·잠정 등급 요율로 계산하며 전체 요율표는 노출하지 않는다', async () => {
  const service = await getQuoteSavingsService();
  const output = await service.calculate({ id, revision: 1, annualRevenue: 200000000, annualCardVolume: 120000000 }, 'proof');
  expect(output.result).toMatchObject({ status: 'calculated', annual: 2400000, pgId, proposedPercent: 1, baselinePercent: 3 });
  expect(output.candidates).toEqual([{ id: pgId, name: 'Alpha' }, { id: otherId, name: 'Beta' }]);
  expect(JSON.stringify(output)).not.toContain('feesByTier');
  expect((await service.calculate({ id, revision: 1, annualRevenue: 200000000, annualCardVolume: 120000000, pgId: otherId }, 'proof')).result)
    .toMatchObject({ annual: 1200000, pgId: otherId });
});
it('소유권·revision·후보 경계를 지키고 Black 업종은 우회하지 않는다', async () => {
  const service = await getQuoteSavingsService();
  await expect(service.calculate({ id, revision: 1 }, 'wrong')).rejects.toThrow('GUEST_DRAFT_UNAVAILABLE');
  await expect(service.calculate({ id, revision: 2 }, 'proof')).rejects.toThrow('GUEST_DRAFT_CHANGED');
  expect((await service.calculate({ id, revision: 1, pgId: randomUUID() }, 'proof')).result.status).toBe('unavailable');
  await db.update(pgMatchingPolicies).set({ policy: { risk: 'black', candidates: [] } }).where(eq(pgMatchingPolicies.groupId, group));
  expect(await service.calculate({ id, revision: 1, annualRevenue: 1, annualCardVolume: 1 }, 'proof'))
    .toMatchObject({ candidates: [], result: { status: 'unavailable' } });
});
