// 정적 예시 비교표 콘텐츠 단일 출처 — 예시값 수정은 이 파일에서. (렌더 구조는 OfferComparisonTable.tsx)
import type { ChipColor } from '@/components/primitives/Chip';

export type Status = { label: string; color: ChipColor };

/** PG 브랜드 — 조건 행과 분리돼 있어 새로고침마다 다른 행에 배정된다(getPgBrandOrder). */
export type PgBrand = {
  pg: string;
  /** 이름 옆 정사각 브랜드 마크 — 각 사 공식 사이트 파비콘 원본(public/images/pg-logos/SOURCES.md). */
  logo: string;
};

/** 예시 조건 행 — 어느 PG 의 조건인지는 정하지 않는다. 최저 수수료(추천) 행이 맨 앞(STEP_ROW 가 0번 행을 강조). */
export type OfferTerms = {
  fee: string;
  settlement: string;
  guarantee: string;
  joinFee: string;
  approval: Status;
  negotiable: Status;
  recommended?: boolean;
};

export type Offer = PgBrand & OfferTerms;

export const COLUMNS = [
  'PG사',
  '수수료',
  '정산주기',
  '보증보험',
  '가입비',
  '승인 상태',
  '협의 가능 여부',
] as const;

export const PG_BRANDS: readonly PgBrand[] = [
  { pg: '토스페이먼츠', logo: '/images/pg-logos/toss-icon.png' },
  { pg: '헥토파이낸셜', logo: '/images/pg-logos/hecto-icon.png' },
];

export const OFFER_TERMS: readonly OfferTerms[] = [
  {
    fee: '1.85%',
    settlement: 'D+1',
    guarantee: '면제',
    joinFee: '면제',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '가능', color: 'tertiary' },
    recommended: true,
  },
  {
    fee: '2.10%',
    settlement: 'D+2',
    guarantee: '면제',
    joinFee: '10만원',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '제한', color: 'surface' },
  },
];

/** Fisher–Yates. 입력은 건드리지 않는다. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 특정 PG 를 추천하는 인상을 주지 않도록 브랜드↔조건 행 배정을 페이지 로드마다 섞는다.
// 한 번 섞은 결과를 캐시해 같은 페이지의 표(히어로·해결 포인트)가 같은 순서를 쓰고,
// useSyncExternalStore 스냅샷이 매번 같은 참조를 돌려받는다.
let pgBrandOrder: readonly PgBrand[] | null = null;

export function getPgBrandOrder(): readonly PgBrand[] {
  return (pgBrandOrder ??= shuffle(PG_BRANDS));
}

export function __resetPgBrandOrderForTest(): void {
  pgBrandOrder = null;
}

export function assignBrands(brands: readonly PgBrand[]): Offer[] {
  return OFFER_TERMS.map((terms, i) => ({ ...brands[i], ...terms }));
}

// 컬럼 인덱스: 0 PG사 · 1 수수료 · 2 정산주기 · 3 보증보험 · 4 가입비 · 5 승인 상태 · 6 협의 가능 여부
// 해결 포인트(SolutionShowcase) 단계 → 강조할 컬럼(들). 마지막 단계는 컬럼 대신 추천 조건 '행'(0번)을 강조.
export const STEP_COLUMNS: readonly (readonly number[])[] = [
  [1], // 투명한 수수료 견적
  [2, 3, 4, 5], // 정산·보증·가입·승인 조건 비교
  [6], // 추가 협의
  [], // 최적 조건 = 추천 조건 행
];
export const STEP_ROW: readonly (number | null)[] = [null, null, null, 0];
