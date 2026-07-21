import { describe, it, expect } from 'vitest';
import { PaymentFeesSchema } from '@/lib/rfp/payment-fees-schema';
import {
  MERCHANT_TIERS,
  PAYMENT_METHOD_LABELS,
  isFlatFeeMethod,
  type PaymentMethod,
} from '@/lib/types/bid';

// PAYMENT_METHOD_LABELS는 Record<PaymentMethod,string>이라 컴파일러가 전체 유니온을
// 강제한다 — PAYMENT_METHOD_CATEGORIES(카테고리 배열)에서 파생하면 카테고리 배치를
// 빠뜨린 신규 수단이 조용히 누락될 수 있어, 반드시 이 컴파일타임 완전성 소스를 쓴다.
const ALL_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

describe('PaymentFeesSchema — 가상계좌 정액(건당 원)', () => {
  it('가상계좌는 1을 초과하는 정수 원 금액을 허용한다 (예: 300원)', () => {
    // 정률 0~1 소수가 아니라 '원' 단위 정수이므로 300 같은 값이 유효해야 한다.
    expect(PaymentFeesSchema.safeParse({ virtual_account: 300 }).success).toBe(true);
    expect(PaymentFeesSchema.safeParse({ virtual_account: 0 }).success).toBe(true);
  });

  it('가상계좌는 소수(원 미만)를 거부한다', () => {
    expect(PaymentFeesSchema.safeParse({ virtual_account: 300.5 }).success).toBe(false);
  });

  it('가상계좌는 음수를 거부한다', () => {
    expect(PaymentFeesSchema.safeParse({ virtual_account: -100 }).success).toBe(false);
  });

  it('가상계좌는 상한 없이 큰 정수 원 금액을 허용한다 (fat-finger 가드 제거)', () => {
    expect(PaymentFeesSchema.safeParse({ virtual_account: 100_001 }).success).toBe(true);
    expect(PaymentFeesSchema.safeParse({ virtual_account: 5_000_000 }).success).toBe(true);
  });

  it('가상계좌는 구간맵(TierRates)을 거부한다 — 정액 수단은 단일 정수만', () => {
    // 정적 타입은 broad(number|TierRates)지만 런타임 refine 이 구간맵을 막아야 한다.
    expect(
      PaymentFeesSchema.safeParse({ virtual_account: { sole: 0.005, general: 0.018 } }).success,
    ).toBe(false);
  });
});

describe('PaymentFeesSchema — 정률(%) 수단은 0~1 소수 유지', () => {
  it('카드는 0~1 소수 요율을 허용하고 1 초과는 거부한다', () => {
    expect(PaymentFeesSchema.safeParse({ card: 0.025 }).success).toBe(true);
    expect(PaymentFeesSchema.safeParse({ card: 1.5 }).success).toBe(false);
  });

  it('카드 구간맵(TierRates)도 그대로 허용한다', () => {
    expect(
      PaymentFeesSchema.safeParse({ card: { sole: 0.005, general: 0.018 } }).success,
    ).toBe(true);
  });
});

describe('PaymentFeesSchema — 애플페이·삼성페이 (간편결제, 정률)', () => {
  it('애플페이·삼성페이는 0~1 소수 요율을 허용하고 1 초과는 거부한다', () => {
    expect(PaymentFeesSchema.safeParse({ apple_pay: 0.023 }).success).toBe(true);
    expect(PaymentFeesSchema.safeParse({ samsung_pay: 0.021 }).success).toBe(true);
    expect(PaymentFeesSchema.safeParse({ apple_pay: 1.5 }).success).toBe(false);
    expect(PaymentFeesSchema.safeParse({ samsung_pay: 1.5 }).success).toBe(false);
  });

  it('애플페이·삼성페이 구간맵(TierRates)도 그대로 허용한다', () => {
    expect(
      PaymentFeesSchema.safeParse({ apple_pay: { sole: 0.005, general: 0.018 } }).success,
    ).toBe(true);
    expect(
      PaymentFeesSchema.safeParse({ samsung_pay: { sole: 0.004, general: 0.017 } }).success,
    ).toBe(true);
  });
});

// 드리프트 가드 — 구간맵의 키 집합은 lib/types/bid.ts 의 MERCHANT_TIERS 가 캐논니컬이다.
// 스키마가 구간을 따로 나열하면 새 등급을 추가했을 때 .strict() 가 그 등급의 요율을
// "알 수 없는 키"로 조용히 거부해, PG 가 입력한 우대수수료가 저장되지 않는다.
describe('PaymentFeesSchema 구간 ↔ MERCHANT_TIERS 드리프트 가드', () => {
  it.each([...MERCHANT_TIERS])('%s 구간 요율을 수용한다', (tier) => {
    expect(PaymentFeesSchema.safeParse({ card: { [tier]: 0.015 } }).success).toBe(true);
  });

  it('전 구간을 한 번에 담은 구간맵을 수용한다', () => {
    const allTiers = Object.fromEntries(MERCHANT_TIERS.map((t) => [t, 0.015]));
    expect(PaymentFeesSchema.safeParse({ card: allTiers }).success).toBe(true);
  });

  it('어휘 밖 구간 키는 거부한다 (.strict 유지)', () => {
    expect(PaymentFeesSchema.safeParse({ card: { platinum: 0.015 } }).success).toBe(false);
  });
});

// 드리프트 가드 — FLAT_FEE_METHODS(isFlatFeeMethod)와 스키마의 단위가 따로 관리되므로,
// 둘 중 하나만 바꾸면 단위가 어긋난다. 모든 수단에 대해 스키마가 isFlatFeeMethod 과
// 같은 단위(정액=정수 원 / 정률=0~1 소수)로 검증하는지 행위로 고정한다.
describe('PaymentFeesSchema 단위 ↔ isFlatFeeMethod 드리프트 가드', () => {
  it.each(ALL_METHODS)(
    '%s: 정액 수단은 정수 원 허용·소수 거부, 정률 수단은 0~1 소수 허용·>1 거부',
    (m) => {
      const accepts = (v: unknown) => PaymentFeesSchema.safeParse({ [m]: v }).success;
      if (isFlatFeeMethod(m)) {
        expect(accepts(300)).toBe(true); // '원' 정수
        expect(accepts(0.5)).toBe(false); // 소수 거부
      } else {
        expect(accepts(0.005)).toBe(true); // 0~1 소수 요율
        expect(accepts(300)).toBe(false); // >1 거부 (정률은 0~1)
      }
    },
  );
});
