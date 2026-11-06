import type { CurrentPg } from '@/lib/rfp/current-pgs';
import type { MerchantTier } from '@/lib/types/bid';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { pgMatchingDefaults, pgMatchingPolicies, pgRecommendationGroups, rfpMatchingRequests, rfpPgReviews, rfps, workspaces, bizProfiles } from '@/lib/db/schema';
import type { Recommendation, PgReview } from '@/lib/rfp/pg-matching';
import type { IndustryGroupRow, PgDirectoryEntry } from '@/lib/rfp/pg-recommendation-rules';
import type { Tx } from '../types';

/**
 * 맞춤 PG 상담의 영속(상담 요청·심사)과 원시 읽기만 맡는다. 추천 산출(업종·현재 PG·등급 해석,
 * 정책 평가)은 `lib/server/services/pg-recommendation.ts` 와 `lib/rfp/pg-recommendation-rules.ts`
 * 가 소유한다(ADR 0005). 여기에 규칙을 다시 넣지 않는다.
 */
export class DrizzlePgMatchingRepository {
  constructor(private readonly db: Tx) {}

  // ── 원시 읽기 (추천 산출 입력) ─────────────────────────────────────────

  /** 업종 그룹 전부(id 오름차순) — 정책 행이 없으면 policy=null. 직접 입력 이름 대응용. */
  async industryGroups(tx: Tx = this.db): Promise<IndustryGroupRow[]> {
    return tx.select({ id: pgRecommendationGroups.id, name: pgRecommendationGroups.name, policy: pgMatchingPolicies.policy })
      .from(pgRecommendationGroups).leftJoin(pgMatchingPolicies, eq(pgMatchingPolicies.groupId, pgRecommendationGroups.id))
      .orderBy(asc(pgRecommendationGroups.id));
  }

  /** 그룹 이름과 정책 원문. 그룹이 없으면 undefined, 정책 행이 없으면 policy=null. */
  async groupPolicy(groupId: string, tx: Tx = this.db): Promise<{ name: string; policy: unknown } | undefined> {
    const [row] = await tx.select({ name: pgRecommendationGroups.name, policy: pgMatchingPolicies.policy })
      .from(pgRecommendationGroups).leftJoin(pgMatchingPolicies, eq(pgMatchingPolicies.groupId, pgRecommendationGroups.id))
      .where(eq(pgRecommendationGroups.id, groupId));
    return row;
  }

  /** 기본 PG 정책 원문. 미설정이면 undefined. */
  async defaultPolicy(tx: Tx = this.db): Promise<unknown> {
    const [row] = await tx.select({ policy: pgMatchingDefaults.policy }).from(pgMatchingDefaults).where(eq(pgMatchingDefaults.id, 'default'));
    return row?.policy;
  }

  /** 모든 PG 워크스페이스(상태 불문, id 오름차순) — 현재 이용 PG 이름·ID 대응용. */
  async pgDirectory(tx: Tx = this.db): Promise<PgDirectoryEntry[]> {
    return tx.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.type, 'pg')).orderBy(asc(workspaces.id));
  }

  /** 주어진 id 중 활성 PG 워크스페이스만 — 추천 후보 가시성 판정용. */
  async activePgWorkspaces(ids: readonly string[], tx: Tx = this.db): Promise<PgDirectoryEntry[]> {
    if (ids.length === 0) return [];
    return tx.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces).where(and(inArray(workspaces.id, [...ids]), eq(workspaces.type, 'pg'), eq(workspaces.status, 'active')));
  }

  async buyerTier(buyerWorkspaceId: string, tx: Tx = this.db): Promise<MerchantTier | null> {
    const [buyer] = buyerWorkspaceId ? await tx.select({ grade: bizProfiles.grade }).from(workspaces)
      .leftJoin(bizProfiles, eq(bizProfiles.id, workspaces.bizProfileId))
      .where(and(eq(workspaces.id, buyerWorkspaceId), eq(workspaces.type, 'buyer'))) : [];
    return buyer?.grade ?? null;
  }

  // ── 상담 요청·심사 영속 ──────────────────────────────────────────────

  async find(rfpId: string, tx: Tx = this.db) {
    const [row] = await tx.select().from(rfpMatchingRequests).where(eq(rfpMatchingRequests.rfpId, rfpId));
    return row as typeof rfpMatchingRequests.$inferSelect | undefined;
  }

  async lockBuyer(workspaceId: string, tx: Tx) {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update');
  }

  async findByKey(buyerWsId: string, requestKey: string, tx: Tx = this.db): Promise<{ code: string; requestPayloadHash: string; currentPgs: CurrentPg[] } | undefined> {
    const [row] = await tx.select({ code: rfps.code, requestPayloadHash: rfpMatchingRequests.requestPayloadHash, currentPgs: rfpMatchingRequests.currentPgs }).from(rfpMatchingRequests)
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
