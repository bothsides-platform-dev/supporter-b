import { describe, it, expect } from 'vitest';
import { currentTermsV1Schema } from '../current-terms';

describe('currentTermsV1Schema', () => {
  it('유효한 문서를 통과시킨다', () => {
    const r = currentTermsV1Schema.safeParse({
      _v: 1,
      feeRate: '2.5%',
      settlementCycle: 'D+1',
      solution: 'cafe24',
    });
    expect(r.success).toBe(true);
  });

  it('_v 만 있어도 통과한다 (모든 필드 선택)', () => {
    expect(currentTermsV1Schema.safeParse({ _v: 1 }).success).toBe(true);
  });

  it('_v 는 리터럴 1이어야 한다', () => {
    expect(currentTermsV1Schema.safeParse({ _v: 2 }).success).toBe(false);
    expect(currentTermsV1Schema.safeParse({}).success).toBe(false);
  });

  it('알 수 없는 키는 strict 로 거부한다', () => {
    expect(currentTermsV1Schema.safeParse({ _v: 1, bogus: 'x' }).success).toBe(false);
  });

  it('solution 은 허용된 enum 만 통과시킨다', () => {
    expect(currentTermsV1Schema.safeParse({ _v: 1, solution: 'wix' }).success).toBe(false);
    expect(currentTermsV1Schema.safeParse({ _v: 1, solution: 'self' }).success).toBe(true);
  });

  it('과도하게 긴 값은 거부한다 (컬럼 length CHECK 대체)', () => {
    expect(
      currentTermsV1Schema.safeParse({ _v: 1, feeRate: 'x'.repeat(51) }).success,
    ).toBe(false);
    expect(
      currentTermsV1Schema.safeParse({ _v: 1, annualPgVolume: 'x'.repeat(101) }).success,
    ).toBe(false);
  });
});
