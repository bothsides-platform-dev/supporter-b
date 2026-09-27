import { describe, expect, it } from 'vitest';
import { sampleBusinessCalendar } from '../sample-calendar';

describe('sampleBusinessCalendar', () => {
  it('KST 기준 올해와 다음 해를 공휴일 없이 덮는다', () => {
    // 2026-12-31 16:00Z = 2027-01-01 01:00 KST
    expect(sampleBusinessCalendar(new Date('2026-12-31T16:00:00Z'))).toEqual({
      coveredFrom: '2027-01-01', coveredThrough: '2028-12-31', holidays: [], version: 'sample',
    });
  });
});
