import { afterEach, describe, expect, it } from 'vitest';
import {
  OFFER_TERMS,
  PG_BRANDS,
  STEP_ROW,
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
    const first = getPgBrandOrder();
    expect(getPgBrandOrder()).toBe(first);
  });

  it('contains every brand exactly once', () => {
    expect([...getPgBrandOrder()].map((b) => b.pg).sort()).toEqual(PG_BRANDS.map((b) => b.pg).sort());
  });
});

describe('OFFER_TERMS', () => {
  it('only displays Toss and Hecto brands', () => {
    expect(PG_BRANDS.map((brand) => brand.pg)).toEqual(['토스페이먼츠', '헥토파이낸셜']);
  });
  it('has one condition row per brand, with only the first row recommended', () => {
    expect(OFFER_TERMS).toHaveLength(PG_BRANDS.length);
    expect(OFFER_TERMS[0].recommended).toBe(true);
    expect(OFFER_TERMS.filter((t) => t.recommended)).toHaveLength(1);
  });

  it('points every highlighted step row at the recommended terms row', () => {
    // 브랜드가 행을 따라다니지 않으므로, '최적 조건' 단계가 추천 행을 가리키는 것은 조건 배열 순서에만 달려 있다.
    const rows = STEP_ROW.filter((r): r is number => r !== null);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(OFFER_TERMS[r].recommended).toBe(true);
  });
});
