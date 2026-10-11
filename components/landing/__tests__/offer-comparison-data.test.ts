import { afterEach, describe, expect, it } from 'vitest';
import {
  OFFER_TERMS,
  PG_BRANDS,
  __resetPgBrandOrderForTest,
  getPgBrandOrder,
  shuffle,
} from '../offer-comparison-data';

afterEach(() => __resetPgBrandOrderForTest());

describe('shuffle', () => {
  it('returns a permutation of the input without mutating it', () => {
    const input = ['a', 'b', 'c'] as const;
    const out = shuffle(input, () => 0);
    expect(out).toEqual(['b', 'c', 'a']);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('can keep the original order when random picks the last slot', () => {
    expect(shuffle(['a', 'b', 'c'], () => 0.999)).toEqual(['a', 'b', 'c']);
  });
});

describe('getPgBrandOrder', () => {
  it('returns the same reference on every call within a page load', () => {
    // useSyncExternalStore 는 같은 스냅샷을 돌려받아야 무한 리렌더에 빠지지 않는다.
    const first = getPgBrandOrder(() => 0);
    expect(getPgBrandOrder(() => 0.999)).toBe(first);
  });

  it('contains every brand exactly once', () => {
    expect([...getPgBrandOrder()].map((b) => b.pg).sort()).toEqual(PG_BRANDS.map((b) => b.pg).sort());
  });
});

describe('OFFER_TERMS', () => {
  it('has one condition row per brand, with only the first row recommended', () => {
    expect(OFFER_TERMS).toHaveLength(PG_BRANDS.length);
    expect(OFFER_TERMS.map((t) => Boolean(t.recommended))).toEqual([true, false, false]);
  });
});
