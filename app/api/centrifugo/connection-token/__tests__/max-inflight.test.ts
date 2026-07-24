/**
 * resolveMaxInflight — load-shed 상한의 env 파싱.
 *
 * 종전에는 route 가 `Number(env)` 를 그대로 썼다: env 가 'abc' 같은 malformed
 * 값이면 NaN → `inFlight >= NaN` 이 항상 false → load-shed 전체가 소리 없이
 * 꺼졌다. 음수도 마찬가지로 위험하다(항상 true → 전 요청 503). 여기서
 * finite ≥ 0 만 수용하고 나머지는 기본값 25 로 폴백하는 것을 고정한다.
 * '0' 은 유효한 킬스위치(전부 shed)다 — route.test.ts 가 커버.
 */
import { describe, expect, it } from 'vitest';

import { resolveMaxInflight } from '../_max-inflight';

describe('resolveMaxInflight', () => {
  it('미설정(undefined)·빈 문자열은 기본값 25', () => {
    expect(resolveMaxInflight(undefined)).toBe(25);
    expect(resolveMaxInflight('')).toBe(25);
  });

  it('유효한 숫자 문자열은 그대로 쓴다', () => {
    expect(resolveMaxInflight('40')).toBe(40);
    expect(resolveMaxInflight('0')).toBe(0); // 킬스위치 — 전부 shed
  });

  it('malformed 값(NaN)은 load-shed 를 끄지 않고 기본값으로 폴백한다', () => {
    expect(resolveMaxInflight('abc')).toBe(25);
    expect(resolveMaxInflight('25 tokens')).toBe(25);
  });

  it('음수는 전 요청 shed 가 되므로 기본값으로 폴백한다', () => {
    expect(resolveMaxInflight('-5')).toBe(25);
  });
});
