// 정적 예시 비교표 콘텐츠 단일 출처 — 예시값 수정은 이 파일에서. (렌더 구조는 OfferComparisonTable.tsx)
import type { ChipColor } from '@/components/primitives/Chip';

export type Status = { label: string; color: ChipColor };

export type Offer = {
  pg: string;
  fee: string;
  settlement: string;
  guarantee: string;
  joinFee: string;
  approval: Status;
  negotiable: Status;
  recommended?: boolean;
};

export const COLUMNS = [
  'PG사',
  '수수료',
  '정산주기',
  '보증보험',
  '가입비',
  '승인 상태',
  '협의 가능 여부',
] as const;

export const OFFERS: Offer[] = [
  {
    pg: 'PG A',
    fee: '1.85%',
    settlement: 'D+1',
    guarantee: '면제',
    joinFee: '면제',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '가능', color: 'tertiary' },
    recommended: true,
  },
  {
    pg: 'PG B',
    fee: '1.95%',
    settlement: 'D+1',
    guarantee: '1천만원',
    joinFee: '면제',
    approval: { label: '검토중', color: 'warning' },
    negotiable: { label: '가능', color: 'tertiary' },
  },
  {
    pg: 'PG C',
    fee: '2.10%',
    settlement: 'D+2',
    guarantee: '면제',
    joinFee: '10만원',
    approval: { label: '승인 가능', color: 'tertiary' },
    negotiable: { label: '제한', color: 'surface' },
  },
];

// 컬럼 인덱스: 0 PG사 · 1 수수료 · 2 정산주기 · 3 보증보험 · 4 가입비 · 5 승인 상태 · 6 협의 가능 여부
// 해결 포인트(SolutionShowcase) 단계 → 강조할 컬럼(들). 마지막 단계는 컬럼 대신 추천 PG '행'을 강조.
export const STEP_COLUMNS: readonly (readonly number[])[] = [
  [1], // 투명한 수수료 견적
  [2, 3, 4, 5], // 정산·보증·가입·승인 조건 비교
  [6], // 추가 협의
  [], // 최적 조건 = 추천 PG 행
];
export const STEP_ROW: readonly (number | null)[] = [null, null, null, 0];
