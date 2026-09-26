export function requireCalendarCliEnv(
  env: { DATABASE_URL?: string; BUSINESS_CALENDAR_API_KEY?: string },
  needsApiKey: boolean,
): void {
  if (!env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL_REQUIRED');
  if (needsApiKey && !env.BUSINESS_CALENDAR_API_KEY?.trim()) {
    throw new Error('BUSINESS_CALENDAR_API_KEY_REQUIRED');
  }
}
