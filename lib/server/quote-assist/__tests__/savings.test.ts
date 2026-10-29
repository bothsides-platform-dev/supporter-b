import { afterEach, expect, it, vi } from 'vitest';
import { calculateQuoteSavings, provisionalTier } from '../savings';

afterEach(() => vi.unstubAllGlobals());
it('갱신은 별도로 확인한 카드 거래액과 부가세를 맞춘 요율로 계산하며 AI를 호출하지 않는다', () => {
  vi.stubGlobal('fetch', () => { throw new Error('AI must never be called'); });
  expect(calculateQuoteSavings({
    contractType: 'renewal', annualRevenue: 500000000, annualCardVolume: 120000000,
    currentFeePercent: 3.3, currentFeeVat: 'included',
  }, { pgId: 'pg', pgName: 'PG', proposedPercent: 2, feeNote: '일반 신용카드, 부가세 별도' }))
    .toMatchObject({ status: 'calculated', annual: 1200000, monthly: 100000,
      provisionalTier: 'sme1', baselinePercent: 3, proposedPercent: 2, vat: 'excluded' });
});
it('신규는 같은 PG·등급의 소수 단위 표준 요율을 사용하고 연간과 월간을 각각 반올림한다', () => {
  vi.stubGlobal('fetch', () => { throw new Error('AI must never be called'); });
  expect(calculateQuoteSavings({ contractType: 'new', annualRevenue: 0, annualCardVolume: 123456789 },
    { pgId: 'pg', pgName: 'PG', proposedPercent: 1.5, standardFraction: 0.025, feeNote: '조건' }))
    .toMatchObject({ status: 'calculated', annual: 1234568, monthly: 102881,
      baselinePercent: 2.5, provisionalTier: 'sole', revenueIsEstimate: true });
});
it.each([
  [{ annualCardVolume: undefined }, {}], [{ annualRevenue: undefined }, {}],
  [{ annualCardVolume: -1 }, {}], [{ annualRevenue: NaN }, {}],
  [{}, { standardFraction: null }], [{}, { proposedPercent: null }],
  [{ contractType: 'renewal', currentFeePercent: 3 }, {}],
])('수치나 요율이 부족하면 임의의 금액을 만들지 않는다 (%j)', (input, rate) => {
  expect(calculateQuoteSavings({ contractType: 'new', annualRevenue: 100, annualCardVolume: 100000000, ...input } as Parameters<typeof calculateQuoteSavings>[0],
    { pgId: 'pg', pgName: 'PG', proposedPercent: 2, standardFraction: .03, feeNote: '조건', ...rate }).status).toBe('unavailable');
});
it.each([0, -1])('요율 차이가 %s이면 절감 효과 미확인으로 반환한다', difference => {
  expect(calculateQuoteSavings({ contractType: 'renewal', annualRevenue: 1, annualCardVolume: 100000000, currentFeePercent: 2 + difference, currentFeeVat: 'excluded' },
    { pgId: 'pg', pgName: 'PG', proposedPercent: 2, feeNote: '조건' })).toMatchObject({ status: 'no_saving' });
});
it('0% 요율은 누락으로 취급하지 않는다', () => {
  expect(calculateQuoteSavings({ contractType: 'new', annualRevenue: 0, annualCardVolume: 100000000 },
    { pgId: 'pg', pgName: 'PG', proposedPercent: 0, standardFraction: .02, feeNote: '조건' }))
    .toMatchObject({ status: 'calculated', annual: 2000000 });
});
it('원 단위로 0원이 되는 결과에는 양의 절감 연출을 요청하지 않는다', () => {
  expect(calculateQuoteSavings({ contractType: 'new', annualRevenue: 1, annualCardVolume: 1 },
    { pgId: 'pg', pgName: 'PG', proposedPercent: 1, standardFraction: .02, feeNote: '조건' }))
    .toMatchObject({ status: 'no_saving', annual: 0 });
});
it.each([[300000000, 'sole'], [300000001, 'sme1'], [500000000, 'sme1'], [500000001, 'sme2'],
  [1000000000, 'sme2'], [1000000001, 'sme3'], [3000000000, 'sme3'], [3000000001, 'general']] as const)
  ('연매출 %i의 잠정 등급은 %s다', (revenue, tier) => expect(provisionalTier(revenue)).toBe(tier));
