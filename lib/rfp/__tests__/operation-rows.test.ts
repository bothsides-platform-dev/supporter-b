import { describe, expect, it } from 'vitest';

import { buildRfpOperationRows } from '../operation-rows';
import type { RFP } from '@/lib/types/rfp';

const rfp = {
  websiteUrl: 'https://example.com',
  mainProducts: '의류',
  annualPgVolume: '100000000',
  currentFeeRate: '3.4',
  currentSettlementCycle: 'D+1',
  currentSettlementLimit: '50000000',
  currentGuaranteeInsurance: '30000000',
  deliveryServicePeriod: '3~5일',
  currentSolution: 'self',
  currentSolutionDetail: '자체 몰',
} as RFP;

describe('buildRfpOperationRows', () => {
  it('구매사·PG 화면이 공유할 라벨과 순서를 한 번에 만든다', () => {
    expect(buildRfpOperationRows(rfp, rfp.currentFeeRate)).toEqual([
      ['사업 운영 홈페이지', 'https://example.com'],
      ['주요 판매 상품', '의류'],
      ['전년도 연간 PG 거래액', '1억원'],
      ['현재 카드 수수료', '3.4%'],
      ['현재 정산주기', 'D+1'],
      ['현재 월 정산한도', '5,000만원'],
      ['현재 보증보험', '3,000만원'],
      ['배송 및 서비스 기간', '3~5일'],
      ['현재 운영 솔루션', '자체 개발 (자체 몰)'],
    ]);
  });

  it('PG 비공개 카드 수수료는 해당 행의 값만 비운다', () => {
    expect(buildRfpOperationRows(rfp, undefined)).toContainEqual([
      '현재 카드 수수료',
      undefined,
    ]);
  });
});

it('미응답 입점 판매자는 숨기고 명시한 아니요·가격대·판매 방식은 PG에게 표시한다', () => {
  const input = { ...rfp, productInfo: { cashConvertible: false, maximumPrice: 'under_100k' as const, salesMethods: ['none' as const] } };
  const rows = buildRfpOperationRows(input, undefined).filter(([, value]) => value);
  expect(rows).toContainEqual(['환금성 상품', '없어요']);
  expect(rows).toContainEqual(['최고 상품 가격대', '10만원 미만']);
  expect(rows).toContainEqual(['판매 방식', '해당 없음']);
  expect(rows.some(([label]) => label === '입점 판매자')).toBe(false);
});
