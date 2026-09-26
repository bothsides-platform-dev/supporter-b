import { validateBusinessDeadline, type BusinessDeadlineError } from '@/lib/rfp/business-deadline';
import type { Tx } from '@/lib/server/repositories/types';
import { getBusinessCalendarRepo } from '@/lib/server/repositories/factory';
import { kstDateOf } from '@/lib/utils/deadline';

export async function validateNewDeadline(deadline: Date, now: Date, tx?: Tx): Promise<BusinessDeadlineError | null> {
  if (!Number.isFinite(deadline.getTime())) return 'INVALID_TIME';
  const from = kstDateOf(now);
  const through = kstDateOf(deadline);
  const calendar = await (await getBusinessCalendarRepo()).read(from, through, tx);
  return calendar ? validateBusinessDeadline(now, deadline, calendar) : 'CALENDAR_UNAVAILABLE';
}
