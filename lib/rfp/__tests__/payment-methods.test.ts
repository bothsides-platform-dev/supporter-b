import { describe, expect, it } from 'vitest';

import { formatRequestedPaymentMethods } from '../payment-methods';

describe('formatRequestedPaymentMethods', () => {
  it('기본 결제수단 뒤에 커스텀 결제수단을 입력 순서대로 붙인다', () => {
    expect(
      formatRequestedPaymentMethods(
        ['card', 'bank_transfer'],
        [{ label: '포인트결제' }, { label: '상품권' }],
      ),
    ).toBe('카드 · 계좌이체 · 포인트결제 · 상품권');
  });

  it('한 종류만 있어도 해당 결제수단만 표시한다', () => {
    expect(formatRequestedPaymentMethods(['card'], [])).toBe('카드');
    expect(formatRequestedPaymentMethods([], [{ label: '포인트결제' }])).toBe('포인트결제');
  });

  it('요청한 결제수단이 없으면 섹션 생략에 쓸 undefined를 반환한다', () => {
    expect(formatRequestedPaymentMethods([], [])).toBeUndefined();
  });
});
