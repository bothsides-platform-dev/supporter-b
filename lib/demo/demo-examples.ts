import { isKoreanBusinessDay, businessDeadline } from "@/lib/rfp/business-deadline";
import { sampleBusinessCalendar } from "@/lib/rfp/sample-calendar";

export function demoRequoteDeadline(afterDeadline: string, now = new Date()): string {
  const calendarDto = sampleBusinessCalendar(now);
  const calendar = { ...calendarDto, holidays: new Set(calendarDto.holidays) };
  const earliest = businessDeadline(now, 3, calendar).slice(0, 10);
  let date = new Date(`${afterDeadline.slice(0, 10)}T00:00:00Z`);
  do {
    date = new Date(date.getTime() + 86_400_000);
  } while (date.toISOString().slice(0, 10) < earliest || !isKoreanBusinessDay(date.toISOString().slice(0, 10), calendar));
  return date.toISOString().slice(0, 10);
}
