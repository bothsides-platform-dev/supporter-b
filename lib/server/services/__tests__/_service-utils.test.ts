import { describe, expect, it } from 'vitest';
import { normalizeEmail, bucket15Min } from '../_service-utils';

describe('normalizeEmail', () => {
  it('소문자로 변환한다', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('이미 정규화된 이메일은 그대로 반환한다', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
  });
});

describe('bucket15Min', () => {
  it('같은 15분 창 안의 두 시각은 동일한 버킷을 반환한다', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const within = new Date('2024-01-01T00:14:59Z');
    expect(bucket15Min(base)).toBe(bucket15Min(within));
  });

  it('창이 바뀌면 다른 버킷을 반환한다', () => {
    const before = new Date('2024-01-01T00:14:59Z');
    const after = new Date('2024-01-01T00:15:00Z');
    expect(bucket15Min(before)).not.toBe(bucket15Min(after));
  });

  it('버킷 값은 0 이상의 정수이다', () => {
    const result = bucket15Min(new Date('2024-06-01T12:00:00Z'));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });
});
