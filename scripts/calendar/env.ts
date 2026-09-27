export function requireCalendarCliEnv(
  env: { DATABASE_URL?: string; BUSINESS_CALENDAR_API_KEY?: string },
  needsApiKey: boolean,
): void {
  if (!env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL_REQUIRED');
  if (needsApiKey && !env.BUSINESS_CALENDAR_API_KEY?.trim()) {
    throw new Error('BUSINESS_CALENDAR_API_KEY_REQUIRED');
  }
}

/**
 * 배포 로그에 남겨도 안전한 실패 코드만 뽑는다 — 우리 고정 코드(`DATABASE_URL_REQUIRED` 등)와
 * Postgres SQLSTATE(`42P01` = DDL 미적용). 자유 문장은 연결 문자열을 담을 수 있어 버린다.
 */
export function calendarCliFailureCode(error: unknown): string {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  for (const item of candidates) {
    const code = (item as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  const message = error instanceof Error ? error.message : '';
  return /^[A-Z][A-Z0-9_]+$/.test(message) ? message : 'UNKNOWN';
}
