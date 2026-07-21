import type { Attachment } from './common';

/**
 * 결제수단 어휘의 단일 출처. zod 스키마가 `z.enum()` 에 그대로 넣을 수 있도록 런타임
 * 튜플로 둔다 — 타입 유니온만 있으면 서버 액션·스키마가 배열을 손으로 복제하게 된다.
 * 새 수단 추가 = 이 배열 + 아래 LABELS/CATEGORIES(둘 다 컴파일러가 누락을 잡는다).
 */
export const PAYMENT_METHODS = [
  'card',
  'overseas_card',
  'virtual_account',
  'bank_transfer',
  'naver_pay',
  'kakao_pay',
  'toss_pay',
  'apple_pay',
  'samsung_pay',
  'mobile',
  'gift_card',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: '카드',
  overseas_card: '해외카드',
  virtual_account: '가상계좌',
  bank_transfer: '계좌이체',
  naver_pay: '네이버페이',
  kakao_pay: '카카오페이',
  toss_pay: '토스페이',
  apple_pay: '애플페이',
  samsung_pay: '삼성페이',
  mobile: '휴대폰결제',
  gift_card: '상품권',
};

export const PAYMENT_METHOD_CATEGORIES: {
  label: string;
  methods: PaymentMethod[];
}[] = [
  { label: '카드', methods: ['card', 'overseas_card'] },
  { label: '계좌', methods: ['virtual_account', 'bank_transfer'] },
  { label: '간편결제', methods: ['naver_pay', 'kakao_pay', 'toss_pay', 'apple_pay', 'samsung_pay'] },
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

// 정액(건당) 수단 — 수수료가 정률(%)이 아니라 결제 건당 고정 금액(정수 원)으로 부과된다.
// 가상계좌가 대표 예. paymentFees[정액수단] 의 number 값은 0~1 소수 요율이 아니라 '원' 단위
// 정수다(단위 판별은 isTieredMethod 와 같이 카테고리/수단 상수로만, 값 모양에 의존하지 않는다).
// 정액 수단은 구간(tiered) 수단과 상호배타 — 영세·중소 우대수수료 구간이 적용되지 않는다.
const FLAT_FEE_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>(['virtual_account']);

/** 정액(건당 원) 수단이면 true. 입력·저장·표시 사이트가 % vs 원 분기에 이 함수를 거친다. */
export function isFlatFeeMethod(m: PaymentMethod): boolean {
  return FLAT_FEE_METHODS.has(m);
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
  // one-time sign-up fee (KRW)
  signupFee: number;
  // 결제수단별 수수료 (key: PaymentMethod). value 의 단위는 수단이 결정한다:
  //  · 정률(%) 수단 → 0~1 소수 요율(number) 또는 구간맵(TierRates)
  //  · 정액(건당) 수단(isFlatFeeMethod) → '원' 단위 정수(number, 구간맵 없음)
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
  signupFee: number;
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
};
