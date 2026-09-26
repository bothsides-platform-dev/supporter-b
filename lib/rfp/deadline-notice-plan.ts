import type { BusinessCalendar } from './business-deadline';
import { reminderAtForDeadline } from './deadline-reminder';

type Pending = { id: string; pgWsId: string; round: number; deadline: string };
type Submitted = { pgWsId: string; round: number };

export function planDeadlineNotices(input: {
  now: Date;
  commonDeadline: string;
  calendar: BusinessCalendar;
  pgIds: string[];
  pending: Pending[];
  submitted: Submitted[];
}): {
  reminders: { pgWsId: string; round: number; deadline: string; requoteId: string | null }[];
  closed: boolean;
} {
  const now = input.now.getTime();
  const pendingByPg = new Map(input.pending.map((req) => [req.pgWsId, req]));
  const submitted = new Set(input.submitted.map((bid) => `${bid.pgWsId}:${bid.round}`));
  const reminders: { pgWsId: string; round: number; deadline: string; requoteId: string | null }[] = [];
  for (const pgWsId of new Set(input.pgIds)) {
    const req = pendingByPg.get(pgWsId);
    const deadline = req?.deadline ?? input.commonDeadline;
    const round = req?.round ?? 1;
    if (submitted.has(`${pgWsId}:${round}`)) continue;
    if (now >= Date.parse(deadline)) continue;
    try {
      if (now >= Date.parse(reminderAtForDeadline(deadline, input.calendar))) {
        reminders.push({ pgWsId, round, deadline, requoteId: req?.id ?? null });
      }
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'CALENDAR_UNAVAILABLE') throw error;
    }
  }
  return {
    reminders,
    closed: now >= Math.max(Date.parse(input.commonDeadline), ...input.pending.map((req) => Date.parse(req.deadline))),
  };
}
