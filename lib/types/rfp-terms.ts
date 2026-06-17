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
