// PG 추천 — 업종 선택·현재 이용 PG·가맹점 등급을 해석하고 관리자 정책과 기본 PG, 제외 규칙을
// 적용해 상담 후보를 산출하는 유일한 진입이다. 행 읽기는 repository 에, 규칙은
// lib/rfp/pg-recommendation-rules.ts(pure) 에 있고 이 module 은 둘을 잇는다. 쓰기와 알림이
// 없으므로 호출자는 RFP·구매사 행 잠금 안에서 같은 tx 로 다시 계산할 수 있다(ADR 0005).
import type { CurrentPg } from '@/lib/rfp/current-pgs';
import type { IndustrySelection } from '@/lib/rfp/industry-selection';
import type { Recommendation } from '@/lib/rfp/pg-matching';
import {
  evaluateRecommendation,
  policyCandidateIds,
  resolveCurrentPgs,
  resolveIndustrySelection,
  type ResolvedIndustry,
} from '@/lib/rfp/pg-recommendation-rules';
import { defineAsyncSingleton } from '@/lib/server/_singleton';
import type { DrizzlePgMatchingRepository } from '@/lib/server/repositories/drizzle/pg-matching';
import { getPgMatchingRepo } from '@/lib/server/repositories/factory';
import type { Tx } from '@/lib/server/repositories/types';
import type { MerchantTier } from '@/lib/types/bid';

export type PgRecommendationReads = Pick<
  DrizzlePgMatchingRepository,
  'industryGroups' | 'groupPolicy' | 'defaultPolicy' | 'pgDirectory' | 'activePgWorkspaces' | 'buyerTier'
>;

type Visibility = {
  /** 구매사 워크스페이스 — 확인된 가맹점 등급을 읽는다. 게스트는 생략. */
  buyerWorkspaceId?: string;
  /** 확인된 등급이 없을 때 쓰는 잠정 등급(연매출 구간). */
  provisionalTier?: MerchantTier;
  /** 테스트 PG 포함 여부 — 쿠키 판정은 액션·페이지 가장자리에서만 한다. */
  includeTestPg: boolean;
};

/** 새 선택: 업종 선택과 현재 이용 PG 입력을 해석해 추천한다. */
export type SelectionRecommendationRequest = Visibility & {
  kind: 'selection';
  industry: IndustrySelection;
  currentPgs: readonly CurrentPg[];
  /** 멱등 재시도 시 신원을 유지할 저장분(이전 상담 요청의 현재 PG). */
  retainCurrentPgs?: readonly CurrentPg[];
};

/** 저장된 상담에서 다시: 스냅샷의 업종·현재 PG 로 심사한 PG 를 제외하고 추천한다. */
export type StoredRecommendationRequest = Visibility & {
  kind: 'request';
  request: { groupId: string | null; isCustomIndustry: boolean; industryName: string; currentPgs: CurrentPg[] };
  excludePgIds: readonly string[];
};

export type RecommendationRequest = SelectionRecommendationRequest | StoredRecommendationRequest;

export type TierBasis = 'confirmed' | 'provisional' | 'unknown';

export type Recommended = {
  ok: true;
  industry: ResolvedIndustry;
  currentPgs: CurrentPg[];
  merchantTier: MerchantTier | null;
  tierBasis: TierBasis;
  recommendation: Recommendation;
};

export type RecommendationResult = Recommended | { ok: false; error: 'INVALID_CURRENT_PGS' };

export class PgRecommendationService {
  constructor(private readonly reads: PgRecommendationReads) {}

  /** 저장된 상담 스냅샷은 해석 실패가 없다. */
  recommend(request: StoredRecommendationRequest, tx?: Tx): Promise<Recommended>;
  recommend(request: SelectionRecommendationRequest, tx?: Tx): Promise<RecommendationResult>;
  async recommend(request: RecommendationRequest, tx?: Tx): Promise<RecommendationResult> {
    let industry: ResolvedIndustry;
    let currentPgs: CurrentPg[];
    if (request.kind === 'selection') {
      industry = resolveIndustrySelection(
        request.industry,
        request.industry.industryGroupId ? [] : await this.reads.industryGroups(tx),
      );
      const resolved = resolveCurrentPgs(
        request.currentPgs,
        request.currentPgs.length ? await this.reads.pgDirectory(tx) : [],
        request.retainCurrentPgs,
      );
      if (!resolved.ok) return resolved;
      currentPgs = resolved.currentPgs;
    } else {
      const snapshot = request.request;
      industry = {
        groupId: snapshot.groupId,
        isCustomIndustry: snapshot.isCustomIndustry,
        customName: snapshot.isCustomIndustry ? snapshot.industryName : undefined,
      };
      currentPgs = snapshot.currentPgs;
    }

    const confirmedTier = request.buyerWorkspaceId ? await this.reads.buyerTier(request.buyerWorkspaceId, tx) : null;
    const merchantTier = confirmedTier ?? request.provisionalTier ?? null;
    const group = industry.groupId ? await this.reads.groupPolicy(industry.groupId, tx) : undefined;
    const defaultPolicy = await this.reads.defaultPolicy(tx);
    const activePgs = await this.reads.activePgWorkspaces(policyCandidateIds(group?.policy, defaultPolicy), tx);

    const recommendation = evaluateRecommendation({
      groupId: industry.groupId,
      group,
      customName: industry.customName,
      defaultPolicy,
      activePgs,
      merchantTier,
      currentPgs,
      previousPgIds: request.kind === 'request' ? request.excludePgIds : [],
      includeTestPg: request.includeTestPg,
    });
    return {
      ok: true,
      industry,
      currentPgs,
      merchantTier,
      tierBasis: confirmedTier ? 'confirmed' : merchantTier ? 'provisional' : 'unknown',
      recommendation,
    };
  }
}

export const { get: getPgRecommendationService } = defineAsyncSingleton(
  'pg_recommendation',
  'service',
  async () => new PgRecommendationService(await getPgMatchingRepo()),
);
