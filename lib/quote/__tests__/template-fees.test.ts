import { describe, expect, it } from 'vitest';

import {
  pctToDecimal,
  feeKey,
  buildPaymentFees,
} from '../template-fees';

describe('pctToDecimal', () => {
  it('percent string → decimal', () => {
    expect(pctToDecimal('2.5')).toBe(0.025);
    expect(pctToDecimal('1.25')).toBe(0.0125);
  });
});

describe('feeKey', () => {
  it('joins method:tier', () => {
    expect(feeKey('card', 'sme1')).toBe('card:sme1');
  });
});

describe('buildPaymentFees (flat fees map → paymentFees, ÷100)', () => {
  it('tiered method: only filled tiers, divided by 100', () => {
    const fees = { 'card:sole': '0.8', 'card:general': '2.5' };
    expect(buildPaymentFees(fees, ['card'])).toEqual({
      card: { sole: 0.008, general: 0.025 },
    });
  });

  it('tiered method with no tiers filled is omitted', () => {
    expect(buildPaymentFees({}, ['card'])).toEqual({});
  });

  it('single-rate (정률) method: number ÷100', () => {
    expect(buildPaymentFees({ bank_transfer: '1.2' }, ['bank_transfer'])).toEqual({
      bank_transfer: 0.012,
    });
  });

  it('empty string is omitted', () => {
    expect(buildPaymentFees({ bank_transfer: '' }, ['bank_transfer'])).toEqual({});
  });

  it('only processes the methods passed in', () => {
    const fees = { 'card:sole': '0.8', bank_transfer: '1.2' };
    expect(buildPaymentFees(fees, ['bank_transfer'])).toEqual({ bank_transfer: 0.012 });
  });
});

describe('buildPaymentFees — 정액(건당) 수단은 원 단위 정수, 변환 없음', () => {
  it('가상계좌: percent 변환(÷100) 없이 정수 원 그대로', () => {
    expect(buildPaymentFees({ virtual_account: '300' }, ['virtual_account'])).toEqual({
      virtual_account: 300,
    });
  });

  it('가상계좌 빈 칸은 제외', () => {
    expect(buildPaymentFees({ virtual_account: '' }, ['virtual_account'])).toEqual({});
  });
});
