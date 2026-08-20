// 낙찰 견적 → 계약서 수수료 표 행.
//
// 이 표가 조항 텍스트가 아니라 **데이터**인 이유: 요율이 `결제수단 × 가맹점 등급`
// 행렬이고(`Bid.paymentFees` 는 `number | TierRates`), 가상계좌는 정률이 아니라
// 건당 정액이다. 이 분기를 사람이 문장으로 옮겨 적으면 오기입이 곧 계약 오류가
// 된다. 업계 CLM 이 말하는 "contract as data" 가 정확히 이 자리다.
//
// 값 단위는 `lib/types/bid.ts` 규약을 그대로 따른다 — 정률은 0~1 소수, 정액은
// '원' 단위 정수. 단위 판별은 값 모양이 아니라 **수단 상수**(`isFlatFeeMethod`)로만
// 한다(0.5 가 "50%"인지 "0.5원"인지 값만 보고는 알 수 없다).

import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  isFlatFeeMethod,
  type Bid,
  type CustomPaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import { formatKRW, formatPct } from '@/lib/utils/format';

export type FeeTableRow = {
  /** 결제수단 이름. */
  label: string;
  /** 사람이 읽는 요율 표기. 구간 요율은 등급을 한 셀에 편다. */
  value: string;
};

export type FeeTableInput = {
  paymentFees: Bid['paymentFees'];
  customFees: Bid['customFees'];
  /** 구매사가 직접 추가한 결제수단 — 라벨의 출처는 RFP 다. */
  customMethods: CustomPaymentMethod[];
};

/**
 * 구간 요율을 한 셀에 편다: `영세 0.50% · 중소1 1.10% · 일반 2.50%`.
 *
 * 등급마다 열을 두지 않는 이유는 지면이다 — A4 본문 폭에 6열을 욱여넣으면 글자가
 * 뭉개진다. 한 셀에 펴 두면 줄바꿈 엔진이 알아서 접는다. **정의된 등급만** 싣고
 * 순서는 `MERCHANT_TIERS` 를 따른다(저장 순서를 따르면 딜마다 순서가 달라진다).
 */
function formatTierRates(rates: TierRates): string {
  return MERCHANT_TIERS.filter((tier) => rates[tier] !== undefined)
    .map((tier) => `${MERCHANT_TIER_LABELS[tier]} ${formatPct(rates[tier]!)}`)
    .join(' · ');
}

export function buildFeeTableRows(input: FeeTableInput): FeeTableRow[] {
  const rows: FeeTableRow[] = [];

  // 저장된 객체의 키 순서가 아니라 어휘 상수 순서를 따른다 — 계약서 표의 행 순서가
  // 딜마다 달라지면 같은 PG 의 계약서끼리도 비교가 안 된다.
  for (const method of PAYMENT_METHODS) {
    const fee = input.paymentFees[method];
    if (fee === undefined) continue;
    const label = PAYMENT_METHOD_LABELS[method];
    if (typeof fee === 'object' && fee !== null) {
      rows.push({ label, value: formatTierRates(fee) });
      continue;
    }
    rows.push({
      label,
      value: isFlatFeeMethod(method) ? `건당 ${formatKRW(fee)}` : formatPct(fee),
    });
  }

  for (const [id, rate] of Object.entries(input.customFees)) {
    // 라벨을 못 찾아도 행을 버리지 않는다 — 조용히 버리면 요율 하나가 빠진 채
    // 서명된다. id 라도 남겨 사람이 알아챌 수 있게 한다.
    const label = input.customMethods.find((m) => m.id === id)?.label ?? id;
    rows.push({ label, value: formatPct(rate) });
  }

  return rows;
}
