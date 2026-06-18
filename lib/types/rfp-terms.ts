// RFP "현재 조건" 브리프의 버전드 JSONB 문서.
// bids.paymentFees 의 getMethodRate 와 동일 철학: 읽기는 관대(어떤 _v 든 정규화),
// 쓰기는 정규(항상 현재 버전 emit). 새 브리프 필드 추가 = 아래 타입 + zod(current-terms.ts) 두 곳.

export const CURRENT_TERMS_VERSION = 1 as const;

// 현재 솔루션 어휘 — 타입과 zod(current-terms.ts)가 이 단일 배열에서 파생된다(드리프트 방지).
export const SOLUTION_VALUES = ['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other'] as const;
export type SolutionValue = (typeof SOLUTION_VALUES)[number];

// v1 모양. 모든 키 optional → 키 추가는 non-breaking.
export type CurrentTermsV1 = {
  _v: 1;
  feeRate?: string;
  settlementLimit?: string;
  guaranteeInsurance?: string;
  settlementCycle?: string;
  deliveryServicePeriod?: string;
  solution?: SolutionValue;
  solutionDetail?: string;
  annualPgVolume?: string;
};

// 역대 버전 union (현재는 v1 단일). 미래: CurrentTermsV1 | CurrentTermsV2 …
export type CurrentTermsAny = CurrentTermsV1;
// 현재 정규형
export type CurrentTerms = CurrentTermsV1;

/**
 * 관대한 읽기 + 정규 쓰기. raw 가 어떤 역대 버전이든 현재 정규형으로 올린다.
 * 모든 읽기 사이트가 이 함수를 거치므로 _v 범프는 lazy migration(백필 불필요)이다.
 */
export function migrateCurrentTerms(raw: unknown): CurrentTerms {
  const o = (raw ?? {}) as Record<string, unknown>;
  // 미래 버전 홉은 여기 체인:
  //   const v = typeof o._v === 'number' ? o._v : 1;
  //   if (v < 2) o = upgradeV1toV2(o);
  return { ...(o as CurrentTermsV1), _v: CURRENT_TERMS_VERSION };
}

// 개별 current_* 필드를 버전드 문서로 조립 — insertNew 쓰기 경로 (SSOT).
// null/undefined 는 생략(문서는 sparse), 값 있는 키만 담는다.
type DiscreteBriefFields = {
  currentFeeRate?: string | null;
  currentSettlementLimit?: string | null;
  currentGuaranteeInsurance?: string | null;
  currentSettlementCycle?: string | null;
  deliveryServicePeriod?: string | null;
  currentSolution?: string | null;
  currentSolutionDetail?: string | null;
  annualPgVolume?: string | null;
};

export function currentTermsFromDiscrete(f: DiscreteBriefFields): CurrentTermsV1 {
  const t: CurrentTermsV1 = { _v: CURRENT_TERMS_VERSION };
  if (f.currentFeeRate != null) t.feeRate = f.currentFeeRate;
  if (f.currentSettlementLimit != null) t.settlementLimit = f.currentSettlementLimit;
  if (f.currentGuaranteeInsurance != null) t.guaranteeInsurance = f.currentGuaranteeInsurance;
  if (f.currentSettlementCycle != null) t.settlementCycle = f.currentSettlementCycle;
  if (f.deliveryServicePeriod != null) t.deliveryServicePeriod = f.deliveryServicePeriod;
  // solution 은 문서에서 enum 으로 좁혀지지만, 기존 데이터 보존이 우선이라 read-tolerant 캐스트.
  if (f.currentSolution != null) t.solution = f.currentSolution as SolutionValue;
  if (f.currentSolutionDetail != null) t.solutionDetail = f.currentSolutionDetail;
  if (f.annualPgVolume != null) t.annualPgVolume = f.annualPgVolume;
  return t;
}

// PG에게 숨길 수 있는 필드 경로의 단일 출처(SSOT). hidden_from_pg 는 이 집합의 부분집합만 담고,
// 각 경로는 loadPgRfpDetail 의 PG_STRIP 에 대응 strip 핸들러가 반드시 존재해야 한다
// (fail-closed; pg-strip-coverage 드리프트 테스트가 강제). 새 숨김가능 필드 = 여기 + PG_STRIP 한 쌍.
export const STRIP_PATH_FEE_RATE = 'currentTerms.feeRate' as const;
export const HIDEABLE_PG_PATHS = [STRIP_PATH_FEE_RATE] as const;
export type HideablePgPath = (typeof HIDEABLE_PG_PATHS)[number];

// currentFeeVisibleToPg(opt-out boolean)을 hidden_from_pg 경로 배열로 일반화.
// false = 현재 카드 수수료를 PG 에 숨김 → STRIP_PATH_FEE_RATE 추가.
export function hiddenFromPgFromVisibility(currentFeeVisibleToPg: boolean | undefined): string[] {
  return currentFeeVisibleToPg === false ? [STRIP_PATH_FEE_RATE] : [];
}
