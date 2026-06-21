import type { Attachment } from './common';
import type { MerchantGrade } from './biz-profile';

export type PaymentMethod =
  | 'card'
  | 'overseas_card'
  | 'virtual_account'
  | 'bank_transfer'
  | 'naver_pay'
  | 'kakao_pay'
  | 'toss_pay'
  | 'mobile'
  | 'gift_card';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: '카드',
  overseas_card: '해외카드',
  virtual_account: '가상계좌',
  bank_transfer: '계좌이체',
  naver_pay: '네이버페이',
  kakao_pay: '카카오페이',
  toss_pay: '토스페이',
  mobile: '휴대폰결제',
  gift_card: '상품권',
};

export const PAYMENT_METHOD_CATEGORIES: {
  label: string;
  methods: PaymentMethod[];
}[] = [
  { label: '카드', methods: ['card', 'overseas_card'] },
  { label: '계좌', methods: ['virtual_account', 'bank_transfer'] },
  { label: '간편결제', methods: ['naver_pay', 'kakao_pay', 'toss_pay'] },
  { label: '기타', methods: ['mobile', 'gift_card'] },
];

// ─── 영세·중소가맹점 우대수수료 구간 (여신금융협회 기준 고정 5종) ────────────────
export const MERCHANT_TIERS = ['sole', 'sme1', 'sme2', 'sme3', 'general'] as const;
export type MerchantTier = (typeof MERCHANT_TIERS)[number];
export const MERCHANT_TIER_LABELS: Record<MerchantTier, string> = {
  sole: '영세',
  sme1: '중소1',
  sme2: '중소2',
  sme3: '중소3',
  general: '일반',
};

// 소수 요율의 구간맵 (부분 허용 — 일부 구간만 채워도 됨)
export type TierRates = Partial<Record<MerchantTier, number>>;

// 구매사 등급(MerchantGrade)과 견적 구간(MerchantTier)은 라벨은 같지만 영세 식별자가
// 다르다(등급 small ↔ 구간 sole). 비교 화면이 구매사 등급에 맞는 구간을 먼저 보여줄 때
// 이 매핑을 거친다. 등급 미설정이면 일반(general)으로 폴백한다.
export function tierFromMerchantGrade(grade: MerchantGrade | undefined): MerchantTier {
  if (grade === undefined) return 'general';
  return grade === 'small' ? 'sole' : grade;
}

// 구간이 적용되는 카테고리 라벨 (PAYMENT_METHOD_CATEGORIES.label 기준)
export const TIERED_CATEGORY_LABELS = ['카드', '간편결제'] as const;

// 위 카테고리에 속하지만 영세·중소 우대수수료 구간이 적용되지 않는 예외 수단.
// 우대수수료는 국내 카드결제에만 적용되므로 해외카드는 단일요율로 받는다.
const NON_TIERED_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>(['overseas_card']);

const TIERED_METHODS: ReadonlySet<PaymentMethod> = new Set(
  PAYMENT_METHOD_CATEGORIES.filter((c) =>
    (TIERED_CATEGORY_LABELS as readonly string[]).includes(c.label),
  )
    .flatMap((c) => c.methods)
    .filter((m) => !NON_TIERED_METHODS.has(m)),
);

/** 카테고리 상수로만 판별 — 저장된 값의 모양에 의존하지 않는다. */
export function isTieredMethod(m: PaymentMethod): boolean {
  return TIERED_METHODS.has(m);
}

/**
 * 관대한 요율 접근자. value가 number면 구버전 단일요율로 해석(구간 무관),
 * 구간맵이면 해당 구간 값(없으면 undefined). 모든 읽기 사이트가 이 함수를 거친다.
 */
export function getMethodRate(
  value: number | TierRates | undefined,
  tier: MerchantTier,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return value[tier];
}

// 구매사 직접입력 커스텀 결제수단. id는 서버가 발급(클라는 label만 전송).
export type CustomPaymentMethod = {
  id: string;
  label: string;
};

export type Bid = {
  id: string;
  rfpId: string;
  pgWsId: string;
  invitationId: string;
  /** PG별 제출 순번. 1차=1, 재요청 응답=2…. */
  round: number;
  // 정산주기: "D+1", "W+2", "M+1" 형식의 자유 텍스트
  settleCycle: string;
  // 정산한도 (원/월)
  settleLimit: number;
  // 월 보증보험 (원/연)
  guaranteeInsurance: number;
  // 결제수단별 수수료 (key: PaymentMethod, value: 소수 요율 또는 구간맵)
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
  // 커스텀 결제수단별 수수료 (key: CustomPaymentMethod.id, value: 소수 요율)
  customFees: Record<string, number>;
  proposalPdfs: Attachment[];
  memo?: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedBy: string;
  submittedAt?: string;
  boardColumnId?: string | null;
};

// PG 워크스페이스 공유 견적 템플릿 — 폼 채우기용 직렬화 가능한 부분집합(요율표).
// 커스텀 결제수단·메모·PDF는 RFP 종속적이라 템플릿에 담지 않는다.
export type QuoteTemplateOption = {
  id: string;
  name: string;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
};
