import { describe, it, expect } from 'vitest';
import { formatDate } from '../format';

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
