import { bidConditions, confirmedValue, formatCondition } from '@/lib/quote/terms';
// FocusComparison 의 순수 파생 로직 — 정렬·요율 행 구성. 표현 컴포넌트가 아닌 데이터
// 변환만 담당하므로 단위 테스트로 직접 검증한다(focus-comparison-model.test.ts).
import {
  getMethodRate,
  isTieredMethod,
  isFlatFeeMethod,
  PAYMENT_METHOD_LABELS,
  type Bid,
  type CustomPaymentMethod,
  type MerchantTier,
  type PaymentMethod,
} from '@/lib/types/bid';

/** 카드 수수료 낮은 순 정렬(주어진 구간 기준). 동률·미입력은 뒤로. 입력 불변. */
export function sortBidsByCardFee(bids: Bid[], tier: MerchantTier): Bid[] {
  return [...bids].sort(
    (a, b) =>
      (getMethodRate(a.paymentFees.card, tier) ?? Infinity) -
      (getMethodRate(b.paymentFees.card, tier) ?? Infinity),
  );
}

/** 활성 견적의 결제수단 요율 행 — 각 행 hover 시 전 PG 줄세움(MetricComparePopover). */
export type FeeRow = {
  key: string;
  label: string;
  /** true이면 구간(tier) 의존 수치 — 구간 전환 시 flash 대상 */
  isTiered: boolean;
  /** 'percent' = 정률(%)·소수 요율, 'flat' = 정액(건당 원). 표기 단위를 결정. */
  unit: 'percent' | 'flat';
  getValue: (b: Bid, tier: MerchantTier) => number | null;
  baseline?: string | null;
  getText?: (b: Bid, tier: MerchantTier) => string;
};

/**
 * 활성 견적이 제시한 결제수단 + 커스텀 수단으로 요율 행을 구성한다.
 * 카드 행에는 현재 조건(feeRate)을 기준선으로 단다.
 */
export function buildFeeRows(
  active: Bid,
  customPaymentMethods: CustomPaymentMethod[],
  currentFeeRate: string | null | undefined,
): FeeRow[] {
  const rows: FeeRow[] = [];
  for (const method of [
    ...new Set([
      ...Object.keys(active.paymentFees),
      ...Object.keys(active.quoteTerms?._v === 2 ? active.quoteTerms.fees : {})
        .map((k) => k.split(':')[0])
        .filter((k) => k in PAYMENT_METHOD_LABELS),
    ]),
  ] as PaymentMethod[]) {
    rows.push({
      key: method,
      label: PAYMENT_METHOD_LABELS[method],
      isTiered: isTieredMethod(method),
      unit: isFlatFeeMethod(method) ? 'flat' : 'percent',
      getValue: (b, tier) =>
        confirmedValue(
          bidConditions(b).fees[isTieredMethod(method) ? `${method}:${tier}` : method] ?? {
            state: 'unset',
          },
        ),
      getText: (b, tier) =>
        formatCondition(
          bidConditions(b).fees[isTieredMethod(method) ? `${method}:${tier}` : method],
          isFlatFeeMethod(method) ? '원/건' : '%',
        ),
      baseline: method === 'card' ? currentFeeRate : undefined,
    });
  }
  for (const cm of customPaymentMethods) {
    if (
      active.customFees[cm.id] === undefined &&
      !(active.quoteTerms?._v === 2 && cm.id in active.quoteTerms.fees)
    )
      continue;
    rows.push({
      key: `custom:${cm.id}`,
      label: cm.label,
      isTiered: false,
      unit: 'percent',
      getValue: (b) => confirmedValue(bidConditions(b).fees[cm.id] ?? { state: 'unset' }),
      getText: (b) => formatCondition(bidConditions(b).fees[cm.id], '%'),
    });
  }
  return rows;
}
