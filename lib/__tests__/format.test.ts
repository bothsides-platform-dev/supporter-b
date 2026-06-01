import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime } from '../format';

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
