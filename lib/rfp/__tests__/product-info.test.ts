import { describe, expect, it } from 'vitest';
import { currentTermsV1Schema } from '@/lib/validation/current-terms';
import { currentTermsFromDiscrete } from '@/lib/types/rfp-terms';

describe('판매 정보 저장 계약', () => {
  const productInfo = { cashConvertible: false, maximumPrice: 'under_100k' as const, salesMethods: ['none' as const] };

  it('입점 판매자 응답 없이도 아니요와 해당 없음을 보존한다', () => {
    expect(currentTermsV1Schema.safeParse({ _v: 1, productInfo }).success).toBe(true);
    const input = { mainProducts: '의류', productInfo, currentFeeRate: '3' };
    expect(currentTermsFromDiscrete(input)).toMatchObject({ productInfo });
  });

  it.each([
    { maximumPrice: 'under_100k' as const, salesMethods: ['none' as const] },
    { cashConvertible: false, salesMethods: ['none'] },
    { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: [] },
    { ...productInfo, salesMethods: ['none', 'subscription'] },
    { ...productInfo, maximumPrice: 'unknown' },
    { ...productInfo, hasMarketplaceSellers: 'no' },
  ])('잘못된 판매 정보는 저장하지 않는다: %j', (value) => {
    expect(currentTermsV1Schema.safeParse({ _v: 1, productInfo: value }).success).toBe(false);
  });
});
