import { requireCalendarCliEnv } from './env';

Promise.resolve().then(async () => {
  requireCalendarCliEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    BUSINESS_CALENDAR_API_KEY: process.env.BUSINESS_CALENDAR_API_KEY,
  }, true);
  const { runBusinessCalendarSync } = await import('@/lib/server/services/business-calendar-sync');
  return runBusinessCalendarSync();
}).then((result) => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}).catch(() => {
  // Upstream errors can include the secret query URL; print a fixed code only.
  process.stderr.write('BUSINESS_CALENDAR_SYNC_FAILED\n');
  process.exitCode = 1;
});
