import { industryNameKey, type IndustrySelection } from '@/lib/rfp/industry-selection';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { pgMatchingDefaults, pgMatchingPolicies, pgRecommendationGroups, rfpMatchingRequests, rfpPgReviews, rfps, workspaces } from '@/lib/db/schema';
import { eligibleMatchingCandidates, matchingPolicySchema, type MatchingPolicy, type PgReview, type Recommendation } from '@/lib/rfp/pg-matching';
import { isTestPgName } from '@/lib/features/test-pg';
import type { Tx } from '../types';

export class DrizzlePgMatchingRepository {
  constructor(private readonly db: Tx) {}

  async resolveIndustry(input: IndustrySelection, tx: Tx = this.db) {
    if (input.industryGroupId) return { groupId: input.industryGroupId, isCustomIndustry: false, customName: undefined };
    const groups = await tx.select({ id: pgRecommendationGroups.id, name: pgRecommendationGroups.name, policy: pgMatchingPolicies.policy })
      .from(pgRecommendationGroups).leftJoin(pgMatchingPolicies, eq(pgMatchingPolicies.groupId, pgRecommendationGroups.id))
      .orderBy(asc(pgRecommendationGroups.id));
    const matches = groups.filter(group => industryNameKey(group.name) === industryNameKey(input.customIndustryName!));
    // Legacy names are only unique byte-for-byte; normalization can reveal duplicates.
    const match = matches.find(group => (group.policy as { risk?: string } | null)?.risk === 'black') ?? matches[0];
    return { groupId: match?.id ?? null, isCustomIndustry: !match, customName: match ? undefined : input.customIndustryName };
  }

  async recommendation(groupId: string | null, previous: string[] = [], tx: Tx = this.db, includeTest = false, customName?: string): Promise<Recommendation> {
    if (!groupId) return customName ? this.defaultRecommendation(customName, previous, tx, includeTest) : { risk: 'unconfigured', industryName: '', candidates: [] };
    const [row] = await tx.select({ name: pgRecommendationGroups.name, policy: pgMatchingPolicies.policy })
      .from(pgRecommendationGroups).leftJoin(pgMatchingPolicies, eq(pgMatchingPolicies.groupId, pgRecommendationGroups.id))
      .where(eq(pgRecommendationGroups.id, groupId));
    if (!row) return { risk: 'unconfigured', industryName: '', candidates: [] };
    const parsed = matchingPolicySchema.safeParse(row.policy);
    // An explicit block must never be bypassed, including malformed legacy policies.
    if ((row.policy as { risk?: string } | null)?.risk === 'black') return { risk: 'black', industryName: row.name, candidates: [] };
    const policy: MatchingPolicy = parsed.success ? parsed.data : { risk: 'unconfigured', candidates: [] };
    const candidates = await this.visibleCandidates(policy, previous, tx, includeTest);
    if (candidates.length) return { risk: policy.risk, industryName: row.name, candidates };
    const fallback = await this.defaultRecommendation(row.name, previous, tx, includeTest);
    return fallback.candidates.length ? fallback : { risk: policy.risk, industryName: row.name, candidates: [] };
  }

  private async defaultRecommendation(industryName: string, previous: string[], tx: Tx, includeTest: boolean): Promise<Recommendation> {
    const [defaults] = await tx.select({ policy: pgMatchingDefaults.policy }).from(pgMatchingDefaults).where(eq(pgMatchingDefaults.id, 'default'));
    const fallback = matchingPolicySchema.safeParse(defaults?.policy);
    const candidates = fallback.success && fallback.data.risk === 'gray'
      ? await this.visibleCandidates(fallback.data, previous, tx, includeTest) : [];
    return { risk: 'gray', industryName, source: 'default', candidates };
  }

  private async visibleCandidates(policy: MatchingPolicy, previous: string[], tx: Tx, includeTest: boolean): Promise<Recommendation['candidates']> {
    const ids = policy.candidates.map(c => c.pgWorkspaceId);
    const pgs: { id: string; name: string }[] = ids.length === 0 ? [] : await tx.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces).where(and(inArray(workspaces.id, ids), eq(workspaces.type, 'pg'), eq(workspaces.status, 'active')));
    const visible = pgs.filter(p => includeTest || !isTestPgName(p.name));
    const names = new Map(visible.map(p => [p.id, p.name]));
    return eligibleMatchingCandidates(policy, visible.map(p => p.id), previous)
      .map(c => ({ ...c, name: names.get(c.pgWorkspaceId)! }));
  }

  async find(rfpId: string, tx: Tx = this.db) {
    const [row] = await tx.select().from(rfpMatchingRequests).where(eq(rfpMatchingRequests.rfpId, rfpId));
    return row as typeof rfpMatchingRequests.$inferSelect | undefined;
  }

  async lockBuyer(workspaceId: string, tx: Tx) {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update');
  }

  async findByKey(buyerWsId: string, requestKey: string, tx: Tx = this.db): Promise<{ code: string; requestPayloadHash: string } | undefined> {
    const [row] = await tx.select({ code: rfps.code, requestPayloadHash: rfpMatchingRequests.requestPayloadHash }).from(rfpMatchingRequests)
      .innerJoin(rfps, eq(rfps.id, rfpMatchingRequests.rfpId))
      .where(and(eq(rfpMatchingRequests.buyerWsId, buyerWsId), eq(rfpMatchingRequests.requestKey, requestKey)));
    return row;
  }

  async create(values: typeof rfpMatchingRequests.$inferInsert, candidate: Recommendation['candidates'][number], tx: Tx) {
    await tx.insert(rfpMatchingRequests).values(values);
    await this.addReview(values.rfpId, candidate, tx);
  }

  async addReview(rfpId: string, candidate: Recommendation['candidates'][number], tx: Tx) {
    await tx.insert(rfpPgReviews).values({ rfpId, pgWorkspaceId: candidate.pgWorkspaceId, candidate });
  }

  async reviews(rfpId: string, tx: Tx = this.db): Promise<PgReview[]> {
    const rows: (typeof rfpPgReviews.$inferSelect)[] = await tx.select().from(rfpPgReviews)
      .where(eq(rfpPgReviews.rfpId, rfpId)).orderBy(asc(rfpPgReviews.createdAt), asc(rfpPgReviews.id));
    return rows.map(({ rfpId: _rfpId, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
  }

  async latestStatuses(rfpIds: string[], tx: Tx = this.db): Promise<Map<string, PgReview['status']>> {
    if (rfpIds.length === 0) return new Map();
    const rows = await tx.select({ rfpId: rfpPgReviews.rfpId, status: rfpPgReviews.status })
      .from(rfpPgReviews).where(inArray(rfpPgReviews.rfpId, rfpIds))
      .orderBy(asc(rfpPgReviews.createdAt), asc(rfpPgReviews.id));
    return new Map(rows.map((row) => [row.rfpId, row.status]));
  }

  async updateReview(id: string, status: PgReview['status'], reason: string, tx: Tx) {
    await tx.update(rfpPgReviews).set({ status, reason, updatedAt: new Date() }).where(eq(rfpPgReviews.id, id));
  }
}
