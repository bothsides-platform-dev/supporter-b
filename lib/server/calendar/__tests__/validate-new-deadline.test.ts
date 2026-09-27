import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { DrizzleBusinessCalendarRepository } from '@/lib/server/repositories/drizzle/business-calendar';
import { validateNewDeadline } from '../validate-new-deadline';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('deadline service gate', () => {
  it('returns INVALID_TIME for a malformed service date instead of throwing', async () => {
    expect(await validateNewDeadline(new Date('bad-date'), new Date('2026-09-25T08:00:00Z'), db))
      .toBe('INVALID_TIME');
  });
  it('blocks a new date when the year is not confirmed', async () => {
    expect(await validateNewDeadline(new Date('2026-10-01T09:00:00Z'), new Date('2026-09-25T08:00:00Z'), db))
      .toBe('CALENDAR_UNAVAILABLE');
  });

  it('accepts a valid date after the calendar is loaded', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-09-28', name: '휴일' }], new Date(), 'v1');
    expect(await validateNewDeadline(new Date('2026-10-01T09:00:00Z'), new Date('2026-09-25T08:00:00Z'), db))
      .toBeNull();
  });
  it('accepts a covered December date even when next year has not been loaded', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-12-25', name: '성탄절' }], new Date(), 'v1');
    expect(await validateNewDeadline(new Date('2026-12-30T09:00:00Z'), new Date('2026-12-15T08:00:00Z'), db))
      .toBeNull();
  });
});
