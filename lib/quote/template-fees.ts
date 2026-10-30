import {
  MERCHANT_TIERS,
  isTieredMethod,
  isFlatFeeMethod,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
// 견적 작성·제출의 수수료 매핑. 폼의 percent 문자열을 저장용 decimal로 바꾼다.

// percent 문자열 → decimal.
export const pctToDecimal = (s: string): number => Number((parseFloat(s) / 100).toPrecision(15));

// flat fees map 의 tiered 키 규약: "method:tier".
export const feeKey = (method: PaymentMethod | string, tier: string): string =>
  `${method}:${tier}`;

// flat fees map(percent 문자열) + 대상 결제수단 목록 → paymentFees(decimal). 빈 칸은 제외.
export function buildPaymentFees(
  fees: Record<string, string>,
  methods: readonly PaymentMethod[],
): Partial<Record<PaymentMethod, number | TierRates>> {
  const out: Partial<Record<PaymentMethod, number | TierRates>> = {};
  for (const m of methods) {
    if (isTieredMethod(m)) {
      const map: TierRates = {};
      for (const tier of MERCHANT_TIERS) {
        const v = fees[feeKey(m, tier)] ?? '';
        if (v !== '') map[tier] = pctToDecimal(v);
      }
      if (Object.keys(map).length > 0) out[m] = map;
    } else if (isFlatFeeMethod(m)) {
      // 정액(건당) 수단 — % 변환(÷100) 없이 '원' 단위 정수 그대로.
      const v = fees[m] ?? '';
      if (v !== '') out[m] = parseInt(v, 10);
    } else {
      const v = fees[m] ?? '';
      if (v !== '') out[m] = pctToDecimal(v);
    }
  }
  return out;
}
