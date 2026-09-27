import { calendarCliFailureCode, requireCalendarCliEnv } from './env';

// 배포 스크립트가 PM2 reload 전에 부른다. 영업일 마감은 기능 플래그 없이 항상 적용되므로
// 필요한 연도가 비어 있으면 새 코드를 띄우지 않는다.
Promise.resolve().then(async () => {
  requireCalendarCliEnv({ DATABASE_URL: process.env.DATABASE_URL }, false);
  const { checkBusinessCalendarCoverage } = await import('@/lib/server/services/business-calendar-sync');
  return checkBusinessCalendarCoverage();
}).then((result) => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.missingYears.length) process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`BUSINESS_CALENDAR_CHECK_FAILED ${calendarCliFailureCode(error)}\n`);
  process.exitCode = 1;
});
