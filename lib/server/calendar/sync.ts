import { createHash } from 'node:crypto';
import { kstDateOf } from '@/lib/utils/deadline';
import type { OfficialHoliday } from './official';

type YearData = { year: number; days: OfficialHoliday[]; version: string };
type YearStatus = { year: number; fetchedAt: Date };

export async function syncOfficialCalendar(
  now: Date,
  key: string,
  deps: {
    fetchYear: (year: number, key: string) => Promise<OfficialHoliday[]>;
    commit: (years: YearData[]) => Promise<void>;
  },
): Promise<YearData[]> {
  const currentYear = Number(kstDateOf(now).slice(0, 4));
  const years: YearData[] = [];
  for (const year of [currentYear, currentYear + 1]) {
    const days = await deps.fetchYear(year, key);
    const version = createHash('sha256').update(JSON.stringify(
      [...days].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
    )).digest('hex');
    years.push({ year, days, version });
  }
  await deps.commit(years);
  return years;
}

export function calendarHealth(now: Date, years: YearStatus[]): { staleYears: number[]; missingYears: number[] } {
  const today = kstDateOf(now);
  const horizon = kstDateOf(new Date(now.getTime() + 30 * 86_400_000));
  const required = Array.from({ length: Number(horizon.slice(0, 4)) - Number(today.slice(0, 4)) + 1 },
    (_, offset) => Number(today.slice(0, 4)) + offset);
  const byYear = new Map(years.map((year) => [year.year, year]));
  return {
    staleYears: years.filter((year) => year.year >= Number(today.slice(0, 4)) &&
      year.year <= Number(today.slice(0, 4)) + 1 &&
      now.getTime() - year.fetchedAt.getTime() >= 48 * 3_600_000)
      .map((year) => year.year).sort(),
    missingYears: required.filter((year) => !byYear.has(year)),
  };
}
