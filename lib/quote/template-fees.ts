import {
  MERCHANT_TIERS,
  isTieredMethod,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';

// 견적 템플릿/입찰 폼 공유 수수료 매핑 (순수). BidWizard·QuoteTemplateDrawer·QuoteTemplateList
// 이 각자 복제하던 fmtPct/buildPaymentFees/decode 의 단일 출처. 봉인입찰 제출 경로의 금액
// 산식이므로 동작을 한 줄도 바꾸지 않는다 — 두 호출처의 차이(legacy 단일요율 전개)는
// templateFeesToFlat 의 옵션으로 명시한다.

// 폼은 수수료를 percent 문자열("2.5")로, 저장은 decimal(0.025)로 다룬다.
// decimal → percent 문자열. 부동소수 잔차를 제거(×1e6 반올림 ÷1e4).
export const fmtPct = (rate: number): string => String(Math.round(rate * 1e6) / 1e4);

// percent 문자열 → decimal.
export const pctToDecimal = (s: string): number => parseFloat(s) / 100;

// flat fees map 의 tiered 키 규약: "method:tier".
export const feeKey = (method: PaymentMethod | string, tier: string): string =>
  `${method}:${tier}`;

// 정산주기 문자열("D+3") → { unit, num }. 매칭 실패 시 D+1 로 폴백(템플릿 표기 규약).
export function parseSettleCycle(s: string): { unit: 'D' | 'W' | 'M'; num: string } {
  const m = /^([DWM])\+(\d+)$/.exec(s);
  return { unit: (m?.[1] ?? 'D') as 'D' | 'W' | 'M', num: m?.[2] ?? '1' };
}

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
    } else {
      const v = fees[m] ?? '';
      if (v !== '') out[m] = pctToDecimal(v);
    }
  }
  return out;
}

// paymentFees(decimal) + 대상 결제수단 목록 → flat fees map(percent 문자열).
// spreadLegacyTieredSingleRate: 구버전 단일요율 템플릿이 tiered 결제수단에 단일 number 로
// 저장된 경우 전 구간(MERCHANT_TIERS)에 동일값으로 전개한다(BidWizard.applyTemplate 동작).
// false(기본)면 단일값을 flat 키로 둔다(QuoteTemplateDrawer.editorFromTemplate 동작).
export function templateFeesToFlat(
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>,
  methods: readonly PaymentMethod[],
  opts: { spreadLegacyTieredSingleRate?: boolean } = {},
): Record<string, string> {
  const fees: Record<string, string> = {};
  for (const method of methods) {
    const val = paymentFees[method];
    if (val === undefined) continue;
    if (typeof val === 'object') {
      for (const tier of MERCHANT_TIERS) {
        const r = val[tier];
        if (r !== undefined) fees[feeKey(method, tier)] = fmtPct(r);
      }
    } else if (opts.spreadLegacyTieredSingleRate && isTieredMethod(method)) {
      for (const tier of MERCHANT_TIERS) fees[feeKey(method, tier)] = fmtPct(val);
    } else {
      fees[method] = fmtPct(val);
    }
  }
  return fees;
}
