import { parseOverrideArgs } from './override-args';
import { requireCalendarCliEnv } from './env';

Promise.resolve().then(async () => {
  const entry = parseOverrideArgs(process.argv.slice(2));
  requireCalendarCliEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    BUSINESS_CALENDAR_API_KEY: process.env.BUSINESS_CALENDAR_API_KEY,
  }, false);
  const { getBusinessCalendarRepo } = await import('@/lib/server/repositories/factory');
  const repo = await getBusinessCalendarRepo();
  await repo.setException(entry.date, entry.closed, entry.name, entry.source, entry.actor, entry.reason);
  process.stdout.write('CALENDAR_OVERRIDE_SAVED\n');
}).catch(() => {
  process.stderr.write('CALENDAR_OVERRIDE_FAILED\n');
  process.exitCode = 1;
});
