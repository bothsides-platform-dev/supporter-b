import { describe, expect, it } from 'vitest';
import { calendarCliFailureCode, requireCalendarCliEnv } from '../env';

describe('calendar CLI environment gate', () => {
  it('rejects a missing DB URL before constructing a client', () => {
    expect(() => requireCalendarCliEnv({ DATABASE_URL: '', BUSINESS_CALENDAR_API_KEY: 'key' }, true))
      .toThrow('DATABASE_URL_REQUIRED');
  });
  it('requires an API key for sync but not manual overrides', () => {
    const env = { DATABASE_URL: 'postgres://localhost/db', BUSINESS_CALENDAR_API_KEY: '' };
    expect(() => requireCalendarCliEnv(env, true)).toThrow('BUSINESS_CALENDAR_API_KEY_REQUIRED');
    expect(() => requireCalendarCliEnv(env, false)).not.toThrow();
  });
});

describe('calendar CLI failure code', () => {
  it('reports our own fixed error codes and Postgres SQLSTATE codes', () => {
    expect(calendarCliFailureCode(new Error('DATABASE_URL_REQUIRED'))).toBe('DATABASE_URL_REQUIRED');
    expect(calendarCliFailureCode(Object.assign(new Error('relation "business_calendar_years" does not exist'), { code: '42P01' }))).toBe('42P01');
    expect(calendarCliFailureCode({ cause: { code: '42P01' } })).toBe('42P01');
  });
  it('never echoes free-form messages that could carry connection details', () => {
    expect(calendarCliFailureCode(new Error('connect ECONNREFUSED 10.0.0.5:5432 (host db.internal)'))).toBe('UNKNOWN');
    expect(calendarCliFailureCode('boom')).toBe('UNKNOWN');
  });
});
