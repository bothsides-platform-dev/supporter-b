// template-fees — 견적 템플릿/입찰 폼 공유 수수료 매핑(순수). BidWizard·QuoteTemplateDrawer·
// QuoteTemplateList 가 각자 복제하던 fmtPct/buildPaymentFees/decode 를 단일 출처로 모은다.
// 봉인입찰 제출 경로의 금액 산식이라 round-trip·legacy 전개를 명시적으로 고정한다.

import { describe, expect, it } from 'vitest';

import {
  fmtPct,
  pctToDecimal,
  feeKey,
  parseSettleCycle,
  buildPaymentFees,
  templateFeesToFlat,
} from '../template-fees';

describe('fmtPct / pctToDecimal', () => {
  it('decimal rate → percent string', () => {
    expect(fmtPct(0.025)).toBe('2.5');
    expect(fmtPct(0.0125)).toBe('1.25');
    expect(fmtPct(0.012)).toBe('1.2');
    expect(fmtPct(0)).toBe('0');
  });

  it('percent string → decimal', () => {
    expect(pctToDecimal('2.5')).toBe(0.025);
    expect(pctToDecimal('1.25')).toBe(0.0125);
  });

  it('round-trips fmtPct(pctToDecimal(x)) === x', () => {
    expect(fmtPct(pctToDecimal('2.5'))).toBe('2.5');
    expect(fmtPct(pctToDecimal('1.2'))).toBe('1.2');
  });
});

describe('feeKey', () => {
  it('joins method:tier', () => {
    expect(feeKey('card', 'sme1')).toBe('card:sme1');
  });
});

describe('parseSettleCycle', () => {
  it('parses D/W/M + n', () => {
    expect(parseSettleCycle('D+3')).toEqual({ unit: 'D', num: '3' });
    expect(parseSettleCycle('M+2')).toEqual({ unit: 'M', num: '2' });
    expect(parseSettleCycle('W+7')).toEqual({ unit: 'W', num: '7' });
  });

  it('falls back to D+1 on no match (bare "D", garbage)', () => {
    expect(parseSettleCycle('D')).toEqual({ unit: 'D', num: '1' });
    expect(parseSettleCycle('garbage')).toEqual({ unit: 'D', num: '1' });
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

describe('templateFeesToFlat (paymentFees → flat fees map, fmtPct)', () => {
  it('TierRates object → per-tier percent strings', () => {
    expect(
      templateFeesToFlat({ card: { sole: 0.008, general: 0.025 } }, ['card']),
    ).toEqual({ 'card:sole': '0.8', 'card:general': '2.5' });
  });

  it('single-rate NON-tiered (정률) method → flat percent string', () => {
    expect(templateFeesToFlat({ bank_transfer: 0.012 }, ['bank_transfer'])).toEqual({
      bank_transfer: '1.2',
    });
  });

  it('정액(건당) 수단 → fmtPct(×100) 없이 정수 원 문자열 그대로', () => {
    expect(templateFeesToFlat({ virtual_account: 300 }, ['virtual_account'])).toEqual({
      virtual_account: '300',
    });
  });

  it('single-rate TIERED method with spread:false → flat (no tier spread)', () => {
    expect(templateFeesToFlat({ card: 0.02 }, ['card'])).toEqual({ card: '2' });
  });

  it('single-rate TIERED method with spread:true → spread across all tiers (legacy)', () => {
    expect(
      templateFeesToFlat({ card: 0.02 }, ['card'], { spreadLegacyTieredSingleRate: true }),
    ).toEqual({
      'card:sole': '2',
      'card:sme1': '2',
      'card:sme2': '2',
      'card:sme3': '2',
      'card:general': '2',
    });
  });

  it('skips undefined methods and respects the method list', () => {
    expect(templateFeesToFlat({ card: { sole: 0.008 } }, ['virtual_account'])).toEqual({});
  });
});
