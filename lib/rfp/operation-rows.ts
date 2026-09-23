import { productInfoRows } from './product-info';
import type { RFP } from '@/lib/types/rfp';
import {
  formatFeeRateDisplay,
  formatKrwField,
  formatKrwReadable,
} from '@/lib/utils/format';
import { formatSolutionSummary } from './solutions';

export type RfpOperationRow = [label: string, value: string | undefined];

/** 구매사·PG 요청 상세가 공유하는 사업 운영 정보 projection. */
export function buildRfpOperationRows(
  rfp: RFP,
  visibleCurrentFeeRate: string | undefined,
): RfpOperationRow[] {
  return [
    ['사업 운영 홈페이지', rfp.websiteUrl],
    ['주요 판매 상품', rfp.mainProducts],
    ...productInfoRows(rfp.productInfo),
    [
      '전년도 연간 PG 거래액',
      rfp.annualPgVolume
        ? formatKrwReadable(Number(rfp.annualPgVolume)) || rfp.annualPgVolume
        : undefined,
    ],
    ['현재 카드 수수료', formatFeeRateDisplay(visibleCurrentFeeRate) || undefined],
    ['현재 정산주기', rfp.currentSettlementCycle],
    ['현재 월 정산한도', formatKrwField(rfp.currentSettlementLimit)],
    ['현재 보증보험', formatKrwField(rfp.currentGuaranteeInsurance)],
    ['배송 및 서비스 기간', rfp.deliveryServicePeriod],
    [
      '현재 운영 솔루션',
      formatSolutionSummary(rfp.currentSolution, rfp.currentSolutionDetail),
    ],
  ];
}
