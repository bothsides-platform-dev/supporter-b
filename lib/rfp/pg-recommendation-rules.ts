// PG 추천 규칙 (pure). 업종 선택·현재 이용 PG·가맹점 등급에 관리자 정책과 기본 PG,
// 제외 규칙(비활성·테스트·현재·이전 상담 PG)을 적용해 후보 목록과 등급별 요율을 낸다.
// DB·next 의존이 없다 — 행 읽기는 lib/server/services/pg-recommendation.ts 가 맡고
// 이 파일은 읽어 온 행만 받는다. 저장 계약(스키마)은 ./pg-matching.ts 가 admin 레포와 공유한다.
import { currentPgNameKey, type CurrentPg } from './current-pgs';
import { industryNameKey, type IndustrySelection } from './industry-selection';
import {
  eligibleMatchingCandidates,
  storedMatchingPolicySchema,
  type MatchingPolicy,
  type Recommendation,
} from './pg-matching';
import { isTestPgName } from '@/lib/features/test-pg';
import type { MerchantTier } from '@/lib/types/bid';

/** PG 워크스페이스 행(표시명 매칭·후보 이름용). */
export type PgDirectoryEntry = { id: string; name: string };

/** 업종 그룹 행. policy 는 저장 원문(JSONB) 그대로이며 정책 행이 없으면 null. */
export type IndustryGroupRow = { id: string; name: string; policy: unknown };

export type ResolvedIndustry = {
  groupId: string | null;
  isCustomIndustry: boolean;
  /** 등록 업종에 대응하지 못한 직접 입력 이름. 기본 PG(Gray) 추천에 쓴다. */
  customName: string | undefined;
};

export type CurrentPgResolution =
  | { ok: true; currentPgs: CurrentPg[] }
  | { ok: false; error: 'INVALID_CURRENT_PGS' };

export type RecommendationFacts = {
  groupId: string | null;
  /** groupId 에 해당하는 그룹 행. 등록 업종인데 행이 없으면(삭제됨) undefined. */
  group: { name: string; policy: unknown } | undefined;
  customName: string | undefined;
  /** pg_matching_defaults 의 정책 원문. 없으면 undefined. */
  defaultPolicy: unknown;
  /** 정책·기본 정책 후보 id 중 활성(status=active) PG 워크스페이스. */
  activePgs: readonly PgDirectoryEntry[];
  merchantTier: MerchantTier | null;
  currentPgs: readonly CurrentPg[];
  /** 이번 상담에서 이미 심사한 PG — 다시 추천하지 않는다. */
  previousPgIds: readonly string[];
  includeTestPg: boolean;
};

function policyRisk(policy: unknown): string | undefined {
  if (!policy || typeof policy !== 'object' || !('risk' in policy)) return undefined;
  const risk = (policy as { risk?: unknown }).risk;
  return typeof risk === 'string' ? risk : undefined;
}

/**
 * 업종 선택을 그룹에 대응시킨다. 등록 ID 는 존재 여부를 따지지 않고 그대로 둔다(평가 단계가
 * 삭제된 그룹을 unconfigured 로 처리한다). 직접 입력 이름은 정규화해 기존 이름과 맞추고,
 * 정규화로 드러난 중복 이름은 Black 을 우선해 접수 불가 업종을 우회하지 못하게 한다.
 */
export function resolveIndustrySelection(
  selection: IndustrySelection,
  groups: readonly IndustryGroupRow[],
): ResolvedIndustry {
  if (selection.industryGroupId) {
    return { groupId: selection.industryGroupId, isCustomIndustry: false, customName: undefined };
  }
  const key = industryNameKey(selection.customIndustryName ?? '');
  const matches = groups.filter((group) => industryNameKey(group.name) === key);
  const match = matches.find((group) => policyRisk(group.policy) === 'black') ?? matches[0];
  return {
    groupId: match?.id ?? null,
    isCustomIndustry: !match,
    customName: match ? undefined : selection.customIndustryName,
  };
}

/**
 * 현재 이용 PG 입력을 PG 목록과 대응시킨다. ID 가 있으면 목록에 존재해야 하고 표시명은 목록
 * 이름으로 교체한다. 이름만 있으면 정규화 일치로 ID 를 찾고, 없으면 이름만 보존한다.
 * `retained`(재시도 시 저장분)에 같은 항목이 있으면 목록이 바뀌었어도 원래 신원을 유지한다.
 */
export function resolveCurrentPgs(
  input: readonly CurrentPg[],
  directory: readonly PgDirectoryEntry[],
  retained: readonly CurrentPg[] = [],
): CurrentPgResolution {
  if (input.length === 0) return { ok: true, currentPgs: [] };
  const resolved = new Map<string, CurrentPg>();
  for (const item of input) {
    const prior = retained.find((p) =>
      item.pgWorkspaceId ? p.pgWorkspaceId === item.pgWorkspaceId : currentPgNameKey(p.name) === currentPgNameKey(item.name),
    );
    if (prior) {
      resolved.set(prior.pgWorkspaceId ?? currentPgNameKey(prior.name), prior);
      continue;
    }
    const pg = item.pgWorkspaceId
      ? directory.find((p) => p.id === item.pgWorkspaceId)
      : directory.find((p) => currentPgNameKey(p.name) === currentPgNameKey(item.name));
    if (item.pgWorkspaceId && !pg) return { ok: false, error: 'INVALID_CURRENT_PGS' };
    const value: CurrentPg = pg
      ? { pgWorkspaceId: pg.id, name: pg.name }
      : { pgWorkspaceId: null, name: item.name.replace(/\s+/g, ' ') };
    resolved.set(value.pgWorkspaceId ?? currentPgNameKey(value.name), value);
  }
  return { ok: true, currentPgs: [...resolved.values()] };
}

/** 정책 원문들에서 후보 PG id 를 모은다 — 서버가 어떤 워크스페이스 행을 읽을지 정할 때 쓴다. */
export function policyCandidateIds(...policies: unknown[]): string[] {
  const ids = new Set<string>();
  for (const raw of policies) {
    const parsed = storedMatchingPolicySchema.safeParse(raw);
    if (!parsed.success) continue;
    for (const candidate of parsed.data.candidates) ids.add(candidate.pgWorkspaceId);
  }
  return [...ids];
}

function visibleCandidates(policy: MatchingPolicy, facts: RecommendationFacts): Recommendation['candidates'] {
  const candidateIds = new Set(policy.candidates.map((c) => c.pgWorkspaceId));
  const excludedIds = new Set(facts.currentPgs.map((p) => p.pgWorkspaceId));
  const excludedNames = new Set(facts.currentPgs.map((p) => currentPgNameKey(p.name)));
  const visible = facts.activePgs.filter(
    (p) =>
      candidateIds.has(p.id) &&
      (facts.includeTestPg || !isTestPgName(p.name)) &&
      !excludedIds.has(p.id) &&
      !excludedNames.has(currentPgNameKey(p.name)),
  );
  const names = new Map(visible.map((p) => [p.id, p.name]));
  return eligibleMatchingCandidates(policy, visible.map((p) => p.id), [...facts.previousPgIds]).map((c) => ({
    pgWorkspaceId: c.pgWorkspaceId,
    name: names.get(c.pgWorkspaceId)!,
    reason: c.reason,
    merchantTier: facts.merchantTier,
    feeRate: facts.merchantTier === null ? null : c.feesByTier[facts.merchantTier],
    feeNote: c.feeNote,
  }));
}

function defaultRecommendation(industryName: string, facts: RecommendationFacts): Recommendation {
  const fallback = storedMatchingPolicySchema.safeParse(facts.defaultPolicy);
  const candidates =
    fallback.success && fallback.data.risk === 'gray' ? visibleCandidates(fallback.data, facts) : [];
  return { risk: 'gray', industryName, source: 'default', candidates };
}

/**
 * 추천을 산출한다. 그룹이 없는 등록 업종(삭제됨)과 그룹 없는 비직접입력은 unconfigured 다.
 * Black 은 저장 원문의 risk 로 먼저 판정해 손상된 정책도 우회하지 못하게 한다. 업종 후보가
 * 비면 기본 PG(Gray) 로 이어지되, 기본 정책이 없거나 손상되면 임의의 PG 를 고르지 않는다.
 */
export function evaluateRecommendation(facts: RecommendationFacts): Recommendation {
  const unconfigured: Recommendation = { risk: 'unconfigured', industryName: '', candidates: [] };
  if (!facts.groupId) return facts.customName ? defaultRecommendation(facts.customName, facts) : unconfigured;
  if (!facts.group) return unconfigured;
  if (policyRisk(facts.group.policy) === 'black') {
    return { risk: 'black', industryName: facts.group.name, candidates: [] };
  }
  const parsed = storedMatchingPolicySchema.safeParse(facts.group.policy);
  const policy: MatchingPolicy = parsed.success ? parsed.data : { risk: 'unconfigured', candidates: [] };
  const candidates = visibleCandidates(policy, facts);
  if (candidates.length) return { risk: policy.risk, industryName: facts.group.name, candidates };
  const fallback = defaultRecommendation(facts.group.name, facts);
  return fallback.candidates.length ? fallback : { risk: policy.risk, industryName: facts.group.name, candidates: [] };
}
