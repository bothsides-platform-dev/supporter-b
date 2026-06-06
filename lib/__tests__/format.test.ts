import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatSize, formatKrwReadable } from '../format';

describe('formatKrwReadable', () => {
  it('1000의 배수 그룹은 천 단위로 축약한다', () => {
    expect(formatKrwReadable(5000)).toBe('5천원');
    expect(formatKrwReadable(50000)).toBe('5만 원');
    expect(formatKrwReadable(50000000)).toBe('5천만 원');
  });

  it('천 배수가 아닌 그룹은 콤마로 표기한다', () => {
    expect(formatKrwReadable(5000000)).toBe('500만 원');
    expect(formatKrwReadable(12340000)).toBe('1,234만 원');
  });

  it('억·만 그룹을 함께 표기한다', () => {
    expect(formatKrwReadable(120000000)).toBe('1억 2천만 원');
    expect(formatKrwReadable(100000000)).toBe('1억 원');
  });

  it('나머지(원)가 있으면 마지막 토큰에 원을 붙인다', () => {
    expect(formatKrwReadable(12345)).toBe('1만 2,345원');
  });

  it('유효하지 않은 값은 빈 문자열을 반환한다', () => {
    expect(formatKrwReadable(0)).toBe('');
    expect(formatKrwReadable(-5000)).toBe('');
    expect(formatKrwReadable(NaN)).toBe('');
    expect(formatKrwReadable(Infinity)).toBe('');
  });
});

describe('formatDate', () => {
  it('UTC+9 타임존에서 T23:59:59Z 마감일이 같은 날짜로 표시된다', () => {
    // 2026-06-30T23:59:59Z = 2026-07-01 08:59 KST
    // 사용자가 입력한 날짜(2026-06-30)로 표시되어야 함
    const result = formatDate('2026-06-30T23:59:59Z');
    expect(result).toBe('2026. 06. 30.');
  });

  it('날짜만 있는 ISO 문자열도 정상 표시된다', () => {
    const result = formatDate('2026-06-30');
    expect(result).toBe('2026. 06. 30.');
  });
});

describe('formatDateTime', () => {
  it('timezone 미지정 시 KST 기준으로 표시된다', () => {
    // 2026-06-01T05:30:00Z = 2026-06-01 14:30 KST (UTC+9)
    const result = formatDateTime('2026-06-01T05:30:00Z');
    expect(result).toBe('2026-06-01 14:30');
  });

  it('자정 경계에서 KST 날짜로 올바르게 표시된다', () => {
    // 2026-06-30T15:00:00Z = 2026-07-01 00:00 KST — 날짜가 넘어감
    const result = formatDateTime('2026-06-30T15:00:00Z');
    expect(result).toBe('2026-07-01 00:00');
  });

  it('T23:59:59Z는 KST 익일 08:59으로 표시된다', () => {
    // 2026-06-30T23:59:59Z = 2026-07-01 08:59 KST
    const result = formatDateTime('2026-06-30T23:59:59Z');
    expect(result).toBe('2026-07-01 08:59');
  });

  it('명시적 UTC timezone을 따른다', () => {
    const result = formatDateTime('2026-06-01T05:30:00Z', 'UTC');
    expect(result).toBe('2026-06-01 05:30');
  });

  it('명시적 America/New_York timezone을 따른다', () => {
    // 2026-06-01T05:30:00Z = 2026-06-01 01:30 EDT (UTC-4)
    const result = formatDateTime('2026-06-01T05:30:00Z', 'America/New_York');
    expect(result).toBe('2026-06-01 01:30');
  });
});

describe('formatSize', () => {
  it('1KB 미만은 B로 표시', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(999)).toBe('999 B');
  });

  it('1KB 이상 1MB 미만은 KB로 표시 (정수)', () => {
    expect(formatSize(1_000)).toBe('1 KB');
    expect(formatSize(5_000)).toBe('5 KB');
    // 1MB 바로 아래 경계는 MB로 승격되지 않고 KB로 남는다
    expect(formatSize(999_999)).toBe('1000 KB');
  });

  it('1MB 이상은 MB로 표시 (소수 1자리)', () => {
    expect(formatSize(1_000_000)).toBe('1.0 MB');
    expect(formatSize(2_500_000)).toBe('2.5 MB');
  });
});
