import { describe, expect, it } from 'vitest';
import { reminderAtForDeadline } from '../deadline-reminder';

describe('Korean business-day reminder', () => {
  it('reminds on Friday at 09:00 KST for a Monday deadline', () => {
    expect(reminderAtForDeadline('2026-10-12T09:00:00.000Z', {
      coveredFrom: '2026-01-01', coveredThrough: '2026-12-31', holidays: new Set(),
    })).toBe('2026-10-09T00:00:00.000Z');
  });

  it('skips a holiday before a Monday deadline', () => {
    expect(reminderAtForDeadline('2026-10-12T09:00:00.000Z', {
      coveredFrom: '2026-01-01', coveredThrough: '2026-12-31', holidays: new Set(['2026-10-09']),
    })).toBe('2026-10-08T00:00:00.000Z');
  });

  it('requires coverage for the previous year at a year boundary', () => {
    expect(() => reminderAtForDeadline('2027-01-04T09:00:00.000Z', {
      coveredFrom: '2027-01-01', coveredThrough: '2027-12-31', holidays: new Set(['2027-01-01']),
    })).toThrow('CALENDAR_UNAVAILABLE');
  });
});
