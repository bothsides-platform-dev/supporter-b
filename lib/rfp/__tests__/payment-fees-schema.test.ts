import { describe, it, expect } from 'vitest';
import { PaymentFeesSchema } from '@/lib/rfp/payment-fees-schema';

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

  it('가상계좌는 fat-finger 상한(100,000원)을 초과하면 거부한다', () => {
    expect(PaymentFeesSchema.safeParse({ virtual_account: 100_001 }).success).toBe(false);
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
