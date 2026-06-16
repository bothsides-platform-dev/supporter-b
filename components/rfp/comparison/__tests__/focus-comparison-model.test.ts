import { describe, expect, it } from 'vitest';
import { sortBidsByCardFee, buildFeeRows, type FeeRow } from '../focus-comparison-model';
import { getMethodRate, type Bid, type CustomPaymentMethod } from '@/lib/types/bid';

function makeBid(over: Partial<Bid>): Bid {
  return {
    id: 'b',
    rfpId: 'r1',
    pgWsId: 'pg',
    invitationId: 'i1',
    settleCycle: 'D+1',
    settleLimit: 700_000_000,
    guaranteeInsurance: 1_000_000,
    paymentFees: { card: 0.022 },
    customFees: {},
    proposalPdfs: [],
    status: 'submitted',
    submittedBy: 'u1',
    round: 1,
    ...over,
  };
}

describe('sortBidsByCardFee', () => {
  it('orders bids by ascending card fee for the given tier (lowest first)', () => {
    const kg = makeBid({ id: 'kg', paymentFees: { card: 0.028 } });
    const toss = makeBid({ id: 'toss', paymentFees: { card: 0.022 } });
    const sorted = sortBidsByCardFee([kg, toss], 'general');
    expect(sorted.map((b) => b.id)).toEqual(['toss', 'kg']);
  });

  it('puts missing/unparseable card fees last', () => {
    const has = makeBid({ id: 'has', paymentFees: { card: 0.03 } });
    const none = makeBid({ id: 'none', paymentFees: {} as Bid['paymentFees'] });
    const sorted = sortBidsByCardFee([none, has], 'general');
    expect(sorted.map((b) => b.id)).toEqual(['has', 'none']);
  });

  it('honors the tier when card fee is a tiered matrix', () => {
    const a = makeBid({ id: 'a', paymentFees: { card: { sole: 0.005, general: 0.02 } } });
    const b = makeBid({ id: 'b', paymentFees: { card: { sole: 0.01, general: 0.018 } } });
    // sole: a(0.5%) < b(1.0%); general: b(1.8%) < a(2.0%)
    expect(sortBidsByCardFee([b, a], 'sole').map((x) => x.id)).toEqual(['a', 'b']);
    expect(sortBidsByCardFee([a, b], 'general').map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const input = [makeBid({ id: 'x', paymentFees: { card: 0.03 } }), makeBid({ id: 'y', paymentFees: { card: 0.01 } })];
    const before = input.map((b) => b.id);
    sortBidsByCardFee(input, 'general');
    expect(input.map((b) => b.id)).toEqual(before);
  });
});

describe('buildFeeRows', () => {
  const tier = 'general';
  const current = { feeRate: '2.8%' as string };

  it('emits one row per payment method on the active bid, with card baselined to current feeRate', () => {
    const active = makeBid({ paymentFees: { card: 0.022, bank_transfer: 0.015 } });
    const rows = buildFeeRows(active, [], current.feeRate);
    expect(rows.map((r) => r.key)).toEqual(['card', 'bank_transfer']);
    const card = rows.find((r) => r.key === 'card')!;
    expect(card.baseline).toBe('2.8%');
    const bank = rows.find((r) => r.key === 'bank_transfer')!;
    expect(bank.baseline).toBeUndefined();
  });

  it('row getValue reads the rate for the requested tier', () => {
    const active = makeBid({ paymentFees: { card: { sole: 0.005, general: 0.018 } } });
    const rows = buildFeeRows(active, [], null);
    const card = rows.find((r) => r.key === 'card')!;
    const other = makeBid({ paymentFees: { card: { sole: 0.004, general: 0.02 } } });
    expect(card.getValue(other, 'sole')).toBe(getMethodRate(other.paymentFees.card, 'sole'));
    expect(card.getValue(other, 'general')).toBe(getMethodRate(other.paymentFees.card, 'general'));
  });

  it('appends custom payment methods that the active bid quoted, keyed custom:<id>', () => {
    const cm: CustomPaymentMethod[] = [
      { id: 'cm1', label: '포인트' },
      { id: 'cm2', label: '상품권' },
    ];
    const active = makeBid({ paymentFees: { card: 0.022 }, customFees: { cm1: 0.01 } });
    const rows = buildFeeRows(active, cm, null);
    expect(rows.map((r) => r.key)).toEqual(['card', 'custom:cm1']);
    const custom = rows.find((r) => r.key === 'custom:cm1')!;
    expect(custom.label).toBe('포인트');
    const other = makeBid({ customFees: { cm1: 0.007 } });
    expect(custom.getValue(other, tier)).toBe(0.007);
    const noQuote = makeBid({ customFees: {} });
    expect(custom.getValue(noQuote, tier)).toBeNull();
  });

  it('skips custom methods the active bid did not quote', () => {
    const cm: CustomPaymentMethod[] = [{ id: 'cm1', label: '포인트' }];
    const active = makeBid({ paymentFees: { card: 0.022 }, customFees: {} });
    const rows = buildFeeRows(active, cm, null);
    expect(rows.map((r) => r.key)).toEqual(['card']);
  });
});

// type guard so the FeeRow shape stays the contract the component consumes
const _typecheck: FeeRow = {
  key: 'card',
  label: '카드',
  getValue: () => null,
};
void _typecheck;
