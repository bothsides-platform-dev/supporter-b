import { describe, expect, it, vi } from 'vitest';
import { calendarHealth, syncOfficialCalendar } from '../sync';

const holiday = (year: number) => [{ date: `${year}-01-01`, name: '신정' }];

describe('business calendar sync', () => {
  it('fetches both KST years before committing either year', async () => {
    const calls: string[] = [];
    const fetchYear = vi.fn(async (year: number) => {
      calls.push(`fetch:${year}`);
      return holiday(year);
    });
    const commit = vi.fn(async (years: { year: number; days: { date: string; name: string }[] }[]) => {
      calls.push('commit');
      expect(years.map((entry) => entry.year)).toEqual([2026, 2027]);
      expect(years.map((entry) => entry.days)).toEqual([holiday(2026), holiday(2027)]);
    });
    await syncOfficialCalendar(new Date('2025-12-31T16:00:00Z'), 'secret', { fetchYear, commit });
    expect(calls).toEqual(['fetch:2026', 'fetch:2027', 'commit']);
  });

  it('preserves last good data if the second year fails', async () => {
    const commit = vi.fn();
    await expect(syncOfficialCalendar(new Date('2026-09-26T00:00:00Z'), 'secret', {
      fetchYear: async (year) => {
        if (year === 2027) throw new Error('HOLIDAY_API_INVALID');
        return holiday(year);
      },
      commit,
    })).rejects.toThrow('HOLIDAY_API_INVALID');
    expect(commit).not.toHaveBeenCalled();
  });

  it('reports stale sync and missing 30-day coverage from stored metadata', () => {
    const now = new Date('2026-12-20T03:00:00Z');
    expect(calendarHealth(now, [
      { year: 2026, fetchedAt: new Date('2026-12-17T00:00:00Z') },
    ])).toEqual({ staleYears: [2026], missingYears: [2027] });
    expect(calendarHealth(now, [
      { year: 2026, fetchedAt: new Date('2026-12-19T03:00:00Z') },
      { year: 2027, fetchedAt: new Date('2026-12-19T03:00:00Z') },
    ])).toEqual({ staleYears: [], missingYears: [] });
    expect(calendarHealth(now, [
      { year: 2025, fetchedAt: new Date('2025-12-31T00:00:00Z') },
      { year: 2026, fetchedAt: new Date('2026-12-19T03:00:00Z') },
      { year: 2027, fetchedAt: new Date('2026-12-19T03:00:00Z') },
    ])).toEqual({ staleYears: [], missingYears: [] });
  });
});
