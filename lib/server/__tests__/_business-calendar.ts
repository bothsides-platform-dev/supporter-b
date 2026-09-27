import { getBusinessCalendarRepo } from '@/lib/server/repositories/factory';
import { businessDeadline } from '@/lib/rfp/business-deadline';
import { kstDateOf } from '@/lib/utils/deadline';

/** 영업일 마감은 상시 검증되므로 새 마감을 쓰는 테스트는 KST 기준 올해·다음 해 달력을 먼저 적재한다. */
export async function seedBusinessCalendar(): Promise<void> {
  const year = Number(kstDateOf(new Date()).slice(0, 4));
  const repo = await getBusinessCalendarRepo();
  await repo.replaceYear(year, [], new Date(), 'test');
  await repo.replaceYear(year + 1, [], new Date(), 'test');
}

/** `seedBusinessCalendar` 달력(공휴일 없음) 기준 `days` 영업일 뒤 18:00 KST 마감. */
export function validBusinessDeadline(days = 5, now = new Date()): Date {
  const year = Number(kstDateOf(now).slice(0, 4));
  return new Date(businessDeadline(now, days, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() }));
}
