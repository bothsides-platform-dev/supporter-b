import { kstDateOf } from '@/lib/utils/deadline';

export type BusinessCalendar = {
  coveredFrom?: string;
  coveredThrough: string;
  holidays: ReadonlySet<string>;
  version?: string;
};
export type BusinessDeadlineError =
  | 'TOO_SOON' | 'TOO_LATE' | 'INVALID_TIME' | 'CALENDAR_UNAVAILABLE' | 'HOLIDAY';

const DAY_MS = 86_400_000;

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

function isCovered(date: string, calendar: BusinessCalendar): boolean {
  return date <= calendar.coveredThrough && (!calendar.coveredFrom || date >= calendar.coveredFrom);
}

export function isKoreanBusinessDay(date: string, calendar: BusinessCalendar): boolean {
  if (!isCovered(date, calendar)) throw new Error('CALENDAR_UNAVAILABLE');
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !calendar.holidays.has(date) && !date.endsWith('-05-01');
}

export function businessDeadline(requestedAt: Date, days: number, calendar: BusinessCalendar): string {
  if (!Number.isInteger(days) || days < 1) throw new Error('INVALID_DAYS');
  let date = kstDateOf(requestedAt);
  let count = 0;
  while (count < days) {
    date = nextDate(date);
    if (isKoreanBusinessDay(date, calendar)) count++;
  }
  return new Date(`${date}T09:00:00Z`).toISOString();
}

export function validateBusinessDeadline(
  requestedAt: Date,
  deadline: Date,
  calendar: BusinessCalendar,
): BusinessDeadlineError | null {
  if (!Number.isFinite(deadline.getTime())) return 'INVALID_TIME';
  const date = kstDateOf(deadline);
  const requestedDate = kstDateOf(requestedAt);
  if (!isCovered(date, calendar) || !isCovered(nextDate(requestedDate), calendar)) return 'CALENDAR_UNAVAILABLE';
  if (deadline.toISOString() !== `${date}T09:00:00.000Z`) return 'INVALID_TIME';
  if (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${requestedDate}T00:00:00Z`) > 30 * DAY_MS)
    return 'TOO_LATE';
  try {
    if (!isKoreanBusinessDay(date, calendar)) return 'HOLIDAY';
    const earliest = businessDeadline(requestedAt, 3, calendar);
    if (deadline.toISOString() < earliest) return 'TOO_SOON';
  } catch {
    return 'CALENDAR_UNAVAILABLE';
  }
  return null;
}
