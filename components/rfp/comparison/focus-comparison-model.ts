// FocusComparison 의 순수 파생 로직 — 정렬·요율 행 구성. 표현 컴포넌트가 아닌 데이터
// 변환만 담당하므로 단위 테스트로 직접 검증한다(focus-comparison-model.test.ts).
import {
  getMethodRate,
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
  getValue: (b: Bid, tier: MerchantTier) => number | null;
  baseline?: string | null;
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
  for (const method of Object.keys(active.paymentFees) as PaymentMethod[]) {
    rows.push({
      key: method,
      label: PAYMENT_METHOD_LABELS[method],
      getValue: (b, tier) => getMethodRate(b.paymentFees[method], tier) ?? null,
      baseline: method === 'card' ? currentFeeRate : undefined,
    });
  }
  for (const cm of customPaymentMethods) {
    if (active.customFees[cm.id] === undefined) continue;
    rows.push({
      key: `custom:${cm.id}`,
      label: cm.label,
      getValue: (b) => b.customFees[cm.id] ?? null,
    });
  }
  return rows;
}
