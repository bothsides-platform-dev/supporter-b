import { describe, it, expect } from 'vitest';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_CATEGORIES,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  isFlatFeeMethod,
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
  it('국내카드·간편결제만 true', () => {
    expect(isTieredMethod('card')).toBe(true);
    expect(isTieredMethod('naver_pay')).toBe(true);
    expect(isTieredMethod('kakao_pay')).toBe(true);
    expect(isTieredMethod('toss_pay')).toBe(true);
    expect(isTieredMethod('apple_pay')).toBe(true);
    expect(isTieredMethod('samsung_pay')).toBe(true);
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

describe('isFlatFeeMethod', () => {
  it('가상계좌만 정액(건당 원) 수단이라 true', () => {
    // 가상계좌는 결제 건당 고정 금액(정액)으로 부과 — 정률(%) 아님.
    expect(isFlatFeeMethod('virtual_account')).toBe(true);
  });
  it('그 외 수단은 모두 정률(%)이라 false', () => {
    expect(isFlatFeeMethod('card')).toBe(false);
    expect(isFlatFeeMethod('overseas_card')).toBe(false);
    expect(isFlatFeeMethod('bank_transfer')).toBe(false);
    expect(isFlatFeeMethod('naver_pay')).toBe(false);
    expect(isFlatFeeMethod('mobile')).toBe(false);
    expect(isFlatFeeMethod('gift_card')).toBe(false);
    expect(isFlatFeeMethod('apple_pay')).toBe(false);
    expect(isFlatFeeMethod('samsung_pay')).toBe(false);
  });
  it('정액 수단은 구간(tiered) 수단과 상호배타', () => {
    expect(isTieredMethod('virtual_account')).toBe(false);
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

// 드리프트 가드 — PAYMENT_METHOD_CATEGORIES 는 위저드 렌더링과 isTieredMethod 판정을
// 구동한다. PAYMENT_METHODS 에만 수단을 추가하고 카테고리 배치를 빠뜨리면 zod·라벨은
// 통과하는데 화면엔 아예 안 그려지고 우대수수료 구간도 조용히 비활성된다.
describe('PAYMENT_METHODS ↔ PAYMENT_METHOD_CATEGORIES 완전성', () => {
  const placed = PAYMENT_METHOD_CATEGORIES.flatMap((c) => c.methods);

  it('모든 결제수단이 카테고리에 정확히 한 번 배치된다', () => {
    expect([...placed].sort()).toEqual([...PAYMENT_METHODS].sort());
  });

  it('카테고리에 중복 배치된 수단이 없다', () => {
    expect(placed.length).toBe(new Set(placed).size);
  });
});
