import { describe, expect, it } from 'vitest';
import { requireCalendarCliEnv } from '../env';

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
