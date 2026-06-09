import { describe, it, expect } from 'vitest';
import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  getMethodRate,
} from '@/lib/types/bid';

describe('merchant tiers', () => {
  it('정확히 5구간을 순서대로 노출한다', () => {
    expect(MERCHANT_TIERS).toEqual(['sole', 'sme1', 'sme2', 'sme3', 'general']);
    expect(MERCHANT_TIER_LABELS.sole).toBe('영세');
    expect(MERCHANT_TIER_LABELS.general).toBe('일반');
  });
});

describe('isTieredMethod', () => {
  it('카드·간편결제 카테고리만 true', () => {
    expect(isTieredMethod('card')).toBe(true);
    expect(isTieredMethod('overseas_card')).toBe(true);
    expect(isTieredMethod('naver_pay')).toBe(true);
    expect(isTieredMethod('kakao_pay')).toBe(true);
    expect(isTieredMethod('toss_pay')).toBe(true);
  });
  it('계좌·기타는 false', () => {
    expect(isTieredMethod('virtual_account')).toBe(false);
    expect(isTieredMethod('bank_transfer')).toBe(false);
    expect(isTieredMethod('mobile')).toBe(false);
    expect(isTieredMethod('gift_card')).toBe(false);
  });
});

describe('getMethodRate', () => {
  it('구간맵이면 해당 구간 값', () => {
    expect(getMethodRate({ sole: 0.005, general: 0.018 }, 'sole')).toBe(0.005);
    expect(getMethodRate({ sole: 0.005, general: 0.018 }, 'general')).toBe(0.018);
  });
  it('구간맵에 없는 구간이면 undefined', () => {
    expect(getMethodRate({ sole: 0.005 }, 'sme2')).toBeUndefined();
  });
  it('number(구버전 단일요율)면 구간 무관 그 값', () => {
    expect(getMethodRate(0.0125, 'sole')).toBe(0.0125);
    expect(getMethodRate(0.0125, 'general')).toBe(0.0125);
  });
  it('undefined면 undefined', () => {
    expect(getMethodRate(undefined, 'general')).toBeUndefined();
  });
});
