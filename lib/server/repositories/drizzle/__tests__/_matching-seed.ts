import { randomUUID } from 'node:crypto';
import { pgMatchingPolicies, pgRecommendationGroups } from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';

export async function seedMatchingPolicy(db: PgliteDB, ids: string[]) {
  const industryGroupId = randomUUID();
  await db.insert(pgRecommendationGroups).values({ id: industryGroupId, name: `업종 ${industryGroupId}` });
  await db.insert(pgMatchingPolicies).values({ groupId: industryGroupId, policy: { risk: 'white', candidates: ids.map(pgWorkspaceId => ({ pgWorkspaceId, reason: '사업 검토 상담', feeMin: null, feeMax: null, feeNote: '' })) } });
  return { industryGroupId, requestKey: randomUUID() };
}
