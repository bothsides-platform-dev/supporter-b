import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import { formatDate, formatPct, formatKRW } from '@/lib/format';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

/**
 * 제출 완료 요약(SubmittedSummary)의 label/value 행을 만든다.
 *
 * 정식 /submitted 페이지에서 추출 — 딜룸 견적작성 탭이 제출 후 같은 창에서
 * 이 요약을 보여주도록 흡수하면서, 라우트 삭제 후에도 로직이 생존하게 공용 헬퍼로 뺐다.
 * 구간 요율(TierRates)은 정의된 구간만 '결제수단 (구간)' 으로 펼치고, 커스텀 결제수단은
 * rfp.customPaymentMethods 의 라벨로 표기한다.
 */
export function buildSubmittedSummaryRows(rfp: RFP, bid: Bid): [string, string][] {
  const grade = rfp.bizProfile?.grade;

  return [
    ['견적 요청 번호', rfp.code],
    ['제목', rfp.title],
    ['등급', grade ? MERCHANT_TIER_LABELS[grade] : '—'],
    ['마감', formatDate(rfp.deadline)],
    ['정산 주기', bid.settleCycle],
    ['정산한도', formatKRW(bid.settleLimit)],
    ['월 보증보험', formatKRW(bid.guaranteeInsurance)],
    ...Object.entries(bid.paymentFees).flatMap(([m, fee]) => {
      const label = PAYMENT_METHOD_LABELS[m as PaymentMethod];
      if (typeof fee === 'object' && fee !== null) {
        return MERCHANT_TIERS.filter((t) => (fee as TierRates)[t] !== undefined).map(
          (t) =>
            [`${label} (${MERCHANT_TIER_LABELS[t]})`, formatPct((fee as TierRates)[t]!)] as [
              string,
              string,
            ],
        );
      }
      return [[label, formatPct(fee as number)] as [string, string]];
    }),
    ...Object.entries(bid.customFees).map(([id, fee]) => {
      const label = rfp.customPaymentMethods.find((c) => c.id === id)?.label ?? id;
      return [label, formatPct(fee)] as [string, string];
    }),
  ];
}
