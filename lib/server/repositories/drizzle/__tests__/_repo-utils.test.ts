import { describe, expect, it } from 'vitest';
import { toIso } from '../_repo-utils';

describe('toIso', () => {
  it('유효한 Date 객체를 ISO 문자열로 변환한다', () => {
    const d = new Date('2025-01-01T00:00:00.000Z');
    expect(toIso(d)).toBe('2025-01-01T00:00:00.000Z');
  });

  it('null이면 undefined를 반환한다', () => {
    expect(toIso(null)).toBeUndefined();
  });

  it('undefined이면 undefined를 반환한다', () => {
    expect(toIso(undefined)).toBeUndefined();
  });
});
