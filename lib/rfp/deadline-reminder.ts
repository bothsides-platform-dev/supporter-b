import { isKoreanBusinessDay, type BusinessCalendar } from './business-deadline';
import { kstDateOf } from '@/lib/utils/deadline';

export function reminderAtForDeadline(deadline: string, calendar: BusinessCalendar): string {
  let date = kstDateOf(new Date(deadline));
  for (;;) {
    date = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    if (isKoreanBusinessDay(date, calendar)) return new Date(`${date}T00:00:00Z`).toISOString();
  }
}
