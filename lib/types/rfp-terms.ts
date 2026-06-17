// RFP "현재 조건" 브리프의 버전드 JSONB 문서.
// bids.paymentFees 의 getMethodRate 와 동일 철학: 읽기는 관대(어떤 _v 든 정규화),
// 쓰기는 정규(항상 현재 버전 emit). 새 브리프 필드 추가 = 아래 타입 + zod 한 곳.

export const CURRENT_TERMS_VERSION = 1 as const;

// v1 모양. 모든 키 optional → 키 추가는 non-breaking.
export type CurrentTermsV1 = {
  _v: 1;
  feeRate?: string;
  settlementLimit?: string;
  guaranteeInsurance?: string;
  settlementCycle?: string;
  deliveryServicePeriod?: string;
  solution?: 'cafe24' | 'imweb' | 'makeshop' | 'godo' | 'self' | 'other';
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

// 마이그레이션 dual-write/backfill 용 — 개별 current_* 컬럼을 버전드 문서로 조립.
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
  if (f.currentSolution != null) t.solution = f.currentSolution as CurrentTermsV1['solution'];
  if (f.currentSolutionDetail != null) t.solutionDetail = f.currentSolutionDetail;
  if (f.annualPgVolume != null) t.annualPgVolume = f.annualPgVolume;
  return t;
}

// currentFeeVisibleToPg(opt-out boolean)을 hidden_from_pg 경로 배열로 일반화.
// false = 현재 카드 수수료를 PG 에 숨김 → 'currentTerms.feeRate' 경로 추가.
export function hiddenFromPgFromVisibility(currentFeeVisibleToPg: boolean | undefined): string[] {
  return currentFeeVisibleToPg === false ? ['currentTerms.feeRate'] : [];
}

function sameStrSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

// 백필 1행 결정: 개별컬럼 → 문서/숨김 패치. 변경 불필요하거나 이미 문서 데이터가
// 있으면 null(=skip). 멱등·비클로버 — 재실행해도 기존 문서를 덮어쓰지 않는다.
export function backfillRowPatch(
  row: DiscreteBriefFields & {
    currentTerms: unknown;
    currentFeeVisibleToPg: boolean | undefined;
    hiddenFromPg: string[];
  },
): { currentTerms: CurrentTermsV1; hiddenFromPg: string[] } | null {
  const existing = (row.currentTerms ?? {}) as Record<string, unknown>;
  const existingBriefKeys = Object.keys(existing).filter((k) => k !== '_v');
  if (existingBriefKeys.length > 0) return null; // 이미 문서화됨 — 보존(비클로버)

  const currentTerms = currentTermsFromDiscrete(row);
  const hiddenFromPg = hiddenFromPgFromVisibility(row.currentFeeVisibleToPg);
  const docHasData = Object.keys(currentTerms).some((k) => k !== '_v');
  const hiddenChanged = !sameStrSet(row.hiddenFromPg ?? [], hiddenFromPg);
  if (!docHasData && !hiddenChanged) return null; // 바꿀 게 없음
  return { currentTerms, hiddenFromPg };
}
