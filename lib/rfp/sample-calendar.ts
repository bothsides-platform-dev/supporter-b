import type { BusinessCalendarDto } from '@/lib/server/actions/rfp/getBusinessCalendarAction';
import { kstDateOf } from '@/lib/utils/deadline';

/** 랜딩·튜토리얼 샘플용 달력. 서버를 부르지 않으며 공식 공휴일이 없다 — 주말·5월 1일만 제외된다. */
export function sampleBusinessCalendar(now: Date): BusinessCalendarDto {
  const year = Number(kstDateOf(now).slice(0, 4));
  return { coveredFrom: `${year}-01-01`, coveredThrough: `${year + 1}-12-31`, holidays: [], version: 'sample' };
}
