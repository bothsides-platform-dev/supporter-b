import { describe, it, expect } from 'vitest';
import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  getMethodRate,
  tierFromMerchantGrade,
} from '@/lib/types/bid';

describe('merchant tiers', () => {
  it('정확히 5구간을 순서대로 노출한다', () => {
    expect(MERCHANT_TIERS).toEqual(['sole', 'sme1', 'sme2', 'sme3', 'general']);
    expect(MERCHANT_TIER_LABELS.sole).toBe('영세');
    expect(MERCHANT_TIER_LABELS.general).toBe('일반');
  });
});

describe('isTieredMethod', () => {
  it('국내카드·간편결제만 true', () => {
    expect(isTieredMethod('card')).toBe(true);
    expect(isTieredMethod('naver_pay')).toBe(true);
    expect(isTieredMethod('kakao_pay')).toBe(true);
    expect(isTieredMethod('toss_pay')).toBe(true);
  });
  it('해외카드는 우대수수료 구간 대상이 아니라 false', () => {
    // 영세·중소 우대수수료는 국내 카드결제만 적용 — 해외카드는 단일요율.
    expect(isTieredMethod('overseas_card')).toBe(false);
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

describe('tierFromMerchantGrade', () => {
  it('구매사 등급(MerchantGrade)을 견적 구간(MerchantTier)으로 매핑한다', () => {
    // 영세 라벨은 같지만 식별자가 다르다: 등급은 small, 구간은 sole.
    expect(tierFromMerchantGrade('small')).toBe('sole');
    expect(tierFromMerchantGrade('sme1')).toBe('sme1');
    expect(tierFromMerchantGrade('sme2')).toBe('sme2');
    expect(tierFromMerchantGrade('sme3')).toBe('sme3');
    expect(tierFromMerchantGrade('general')).toBe('general');
  });
  it('등급이 없으면(미설정) 일반(general)으로 폴백한다', () => {
    expect(tierFromMerchantGrade(undefined)).toBe('general');
  });
});
