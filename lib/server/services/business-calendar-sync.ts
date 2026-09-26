import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/observability/logger';
import { kstDateOf } from '@/lib/utils/deadline';
import { fetchOfficialYear } from '@/lib/server/calendar/official';
import { calendarHealth, syncOfficialCalendar } from '@/lib/server/calendar/sync';
import { getBusinessCalendarRepo, getDb } from '@/lib/server/repositories/factory';
import type { Tx } from '@/lib/server/repositories/types';

export async function runBusinessCalendarSync(now = new Date()): Promise<{
  years: number[]; staleYears: number[]; missingYears: number[];
}> {
  const repo = await getBusinessCalendarRepo();
  const current = Number(kstDateOf(now).slice(0, 4));
  let health = { staleYears: [] as number[], missingYears: [] as number[] };
  let years: number[] = [];
  try {
    const key = process.env.BUSINESS_CALENDAR_API_KEY;
    if (!key) throw new Error('BUSINESS_CALENDAR_API_KEY_MISSING');
    years = (await syncOfficialCalendar(now, key, {
      fetchYear: fetchOfficialYear,
      commit: async (data) => {
        const db = await getDb();
        await db.transaction(async (tx: Tx) => {
          for (const entry of data) await repo.replaceYear(entry.year, entry.days, now, entry.version, tx);
        });
      },
    })).map((entry) => entry.year);
  } finally {
    try {
      health = calendarHealth(now, await repo.status([current, current + 1]));
      if (health.staleYears.length || health.missingYears.length) {
        logger.warn('calendar.sync_health', health);
        Sentry.captureException(new Error('calendar_sync_health'), {
          tags: { area: 'business_calendar' }, extra: health,
        });
      }
    } catch { /* health/telemetry must not mask the original sync failure */ }
  }
  return { years, ...health };
}
