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
});

describe('buyer calendar action', () => {
  it('returns a versioned, serializable 30-day window', async () => {
    await (await getBusinessCalendarRepo()).replaceYear(2026, [{ date: '2026-10-05', name: '대체공휴일' }], new Date(), 'v1');
    const result = await getBusinessCalendarAction('2026-09-25T08:00:00Z');
    expect(result.coveredFrom).toBe('2026-01-01');
    expect(result.coveredThrough).toBe('2026-12-31');
    expect(result.holidays).toEqual(['2026-10-05']);
    expect(result.version).toContain('v1');
  });

  it('returns no guessed dates when the year is missing', async () => {
    expect(await getBusinessCalendarAction('2026-09-25T08:00:00Z')).toEqual({
      coveredFrom: '', coveredThrough: '', holidays: [], version: '',
    });
  });

  it('env 설정 없이도 적재된 달력을 돌려주고, 잘못된 요청 시각이면 추정 없이 빈 달력을 돌려준다', async () => {
    await (await getBusinessCalendarRepo()).replaceYear(2026, [], new Date(), 'v1');
    expect((await getBusinessCalendarAction('2026-09-25T08:00:00Z')).coveredThrough).toBe('2026-12-31');
    expect(await getBusinessCalendarAction('not-a-date')).toEqual({
      coveredFrom: '', coveredThrough: '', holidays: [], version: '',
    });
  });
});
