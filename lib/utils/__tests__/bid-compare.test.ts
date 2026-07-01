import { describe, expect, it } from 'vitest';
import {
  parseCurrentValue,
  rankByMetric,
  rankByCycle,
  improvement,
  metricVerdict,
  cycleQuality,
} from '../bid-compare';
import { SETTLE_CYCLE_RE } from '../settle-cycle';
import { getMethodRate, type Bid } from '@/lib/types/bid';

function makeBid(over: Partial<Bid>): Bid {
  return {
    id: 'b1',
    rfpId: 'r1',
    pgWsId: 'pg1',
    invitationId: 'i1',
    settleCycle: 'D+2',
    settleLimit: 500_000_000,
    guaranteeInsurance: 1_000_000,
    paymentFees: { card: 0.028 },
    customFees: {},
    proposalPdfs: [],
    status: 'submitted',
    submittedBy: 'u1',
    round: 1,
    ...over,
  };
}

describe('parseCurrentValue', () => {
  describe("unit 'percent'", () => {
    it('parses "2.8%" to decimal rate 0.028', () => {
      expect(parseCurrentValue('2.8%', 'percent')).toBeCloseTo(0.028, 6);
    });
    it('tolerates whitespace and trailing zeros ("2.80 %")', () => {
      expect(parseCurrentValue('2.80 %', 'percent')).toBeCloseTo(0.028, 6);
    });
    it('treats a bare number as a percentage figure ("2.8" → 0.028)', () => {
      expect(parseCurrentValue('2.8', 'percent')).toBeCloseTo(0.028, 6);
    });
    it('returns null for free text ("협의 가능")', () => {
      expect(parseCurrentValue('협의 가능', 'percent')).toBeNull();
    });
    it('returns null for undefined', () => {
      expect(parseCurrentValue(undefined, 'percent')).toBeNull();
    });
  });

  describe("unit 'krw'", () => {
    it('parses "5억" to 500,000,000', () => {
      expect(parseCurrentValue('5억', 'krw')).toBe(500_000_000);
    });
    it('parses "7000만" to 70,000,000', () => {
      expect(parseCurrentValue('7000만', 'krw')).toBe(70_000_000);
    });
    it('parses "120만원" to 1,200,000', () => {
      expect(parseCurrentValue('120만원', 'krw')).toBe(1_200_000);
    });
    it('parses comma-formatted "1,200,000원" to 1,200,000', () => {
      expect(parseCurrentValue('1,200,000원', 'krw')).toBe(1_200_000);
    });
    it('returns null for free text ("미정")', () => {
      expect(parseCurrentValue('미정', 'krw')).toBeNull();
    });
  });
});

describe('rankByMetric', () => {
  it('orders lower-is-better metric ascending and flags the best', () => {
    const bids = [
      makeBid({ id: 'a', paymentFees: { card: 0.028 } }),
      makeBid({ id: 'b', paymentFees: { card: 0.022 } }),
      makeBid({ id: 'c', paymentFees: { card: 0.025 } }),
    ];
    const ranked = rankByMetric(bids, (b) => getMethodRate(b.paymentFees.card, 'general') ?? null, 'lower');
    expect(ranked.map((r) => r.bid.id)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((r) => r.isBest)).toEqual([true, false, false]);
  });

  it('orders higher-is-better metric descending and flags the best', () => {
    const bids = [
      makeBid({ id: 'a', settleLimit: 500_000_000 }),
      makeBid({ id: 'b', settleLimit: 700_000_000 }),
      makeBid({ id: 'c', settleLimit: 600_000_000 }),
    ];
    const ranked = rankByMetric(bids, (b) => b.settleLimit, 'higher');
    expect(ranked.map((r) => r.bid.id)).toEqual(['b', 'c', 'a']);
    expect(ranked[0].isBest).toBe(true);
  });

  it('sorts bids with a missing value last and never flags them best', () => {
    const bids = [
      makeBid({ id: 'a', paymentFees: {} }),
      makeBid({ id: 'b', paymentFees: { card: 0.022 } }),
    ];
    const ranked = rankByMetric(bids, (b) => getMethodRate(b.paymentFees.card, 'general') ?? null, 'lower');
    expect(ranked.map((r) => r.bid.id)).toEqual(['b', 'a']);
    expect(ranked[1].value).toBeNull();
    expect(ranked[1].isBest).toBe(false);
  });
});

describe('rankByCycle', () => {
  it('orders faster (smaller) settle cycle first and flags the best', () => {
    const bids = [
      makeBid({ id: 'a', settleCycle: 'D+3' }),
      makeBid({ id: 'b', settleCycle: 'D+1' }),
      makeBid({ id: 'c', settleCycle: 'W+1' }),
    ];
    const ranked = rankByCycle(bids);
    expect(ranked.map((r) => r.bid.id)).toEqual(['b', 'a', 'c']);
    expect(ranked.map((r) => r.isBest)).toEqual([true, false, false]);
  });
});

describe('improvement', () => {
  it('flags a lower-is-better proposal below current as an improvement', () => {
    const r = improvement(0.028, 0.022, 'lower');
    expect(r).not.toBeNull();
    expect(r!.better).toBe(true);
    expect(r!.deltaAbs).toBeCloseTo(0.006, 6);
  });

  it('flags a lower-is-better proposal above current as worse', () => {
    const r = improvement(0.022, 0.028, 'lower');
    expect(r!.better).toBe(false);
    expect(r!.deltaAbs).toBeCloseTo(0.006, 6);
  });

  it('flags a higher-is-better proposal above current as an improvement', () => {
    const r = improvement(500_000_000, 700_000_000, 'higher');
    expect(r!.better).toBe(true);
    expect(r!.deltaAbs).toBe(200_000_000);
  });

  it('returns null when the current value is not parseable', () => {
    expect(improvement(null, 0.022, 'lower')).toBeNull();
  });
});

describe('metricVerdict', () => {
  it('returns "better" when a lower-is-better proposal is below current', () => {
    expect(metricVerdict(0.028, 0.022, 'lower')).toBe('better');
  });

  it('returns "worse" when a lower-is-better proposal is above current', () => {
    expect(metricVerdict(0.022, 0.028, 'lower')).toBe('worse');
  });

  it('returns "same" when proposal equals current', () => {
    expect(metricVerdict(0.028, 0.028, 'lower')).toBe('same');
  });

  it('returns "worse" when a higher-is-better proposal is below current', () => {
    expect(metricVerdict(700_000_000, 500_000_000, 'higher')).toBe('worse');
  });

  it('returns null when the current value is not parseable', () => {
    expect(metricVerdict(null, 0.022, 'lower')).toBeNull();
  });
});

describe('cycleQuality', () => {
  it('returns "faster" when the proposal settles sooner than current', () => {
    expect(cycleQuality('D+3', 'D+1')).toBe('faster');
  });
  it('returns "same" for an identical cycle', () => {
    expect(cycleQuality('D+1', 'D+1')).toBe('same');
  });
  it('returns "slower" when the proposal settles later', () => {
    expect(cycleQuality('D+1', 'D+3')).toBe('slower');
  });
  it('returns null when current is missing', () => {
    expect(cycleQuality(undefined, 'D+1')).toBeNull();
  });
  it('returns null when current is not a valid cycle string', () => {
    expect(cycleQuality('협의', 'D+1')).toBeNull();
  });

  // Regression guard for the intentional validator/detector divergence:
  // SETTLE_CYCLE_RE (input validation) rejects D+0, but the buyer's free-text
  // current-terms detector must still compare D+0 (당일정산). A future
  // "unification" swapping CYCLE_RE for SETTLE_CYCLE_RE would silently drop
  // D+0 current-terms from comparison — this test makes that fail loudly.
  it('keeps D+0 (당일정산) current-terms comparable even though the validator rejects D+0', () => {
    expect(cycleQuality('D+0', 'D+1')).toBe('slower');
    expect(cycleQuality('D+0', 'D+0')).toBe('same');
    expect(SETTLE_CYCLE_RE.test('D+0')).toBe(false);
  });
});
