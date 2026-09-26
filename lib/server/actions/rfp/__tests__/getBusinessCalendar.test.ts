import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __useDrizzleWithDbForTest, getBusinessCalendarRepo } from '@/lib/server/repositories/factory';
import { getBusinessCalendarAction } from '../getBusinessCalendarAction';

vi.mock('@/lib/server/actions/_session', () => ({
  requireBuyerActor: async () => ({ ok: true, userId: 'user', workspaceId: 'buyer' }),
}));

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
});

describe('buyer calendar action', () => {
  it('returns a versioned, serializable 30-day window', async () => {
    await (await getBusinessCalendarRepo()).replaceYear(2026, [{ date: '2026-10-05', name: '대체공휴일' }], new Date(), 'v1');
    const result = await getBusinessCalendarAction('2026-09-25T08:00:00Z');
    expect(result.enabled).toBe(true);
    expect(result.coveredFrom).toBe('2026-01-01');
    expect(result.coveredThrough).toBe('2026-12-31');
    expect(result.holidays).toEqual(['2026-10-05']);
    expect(result.version).toContain('v1');
    vi.unstubAllEnvs();
  });

  it('returns no guessed dates when the year is missing', async () => {
    expect(await getBusinessCalendarAction('2026-09-25T08:00:00Z')).toEqual({
      enabled: true, coveredFrom: '', coveredThrough: '', holidays: [], version: '',
    });
    vi.unstubAllEnvs();
  });
});
