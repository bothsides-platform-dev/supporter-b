import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleBusinessCalendarRepository } from '../business-calendar';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });

describe('business calendar repository', () => {
  it('records only newly added official closures as durable events', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-10-05', name: '휴일' }], new Date(), 'v1');
    await repo.replaceYear(2026, [
      { date: '2026-10-05', name: '휴일' }, { date: '2026-10-06', name: '임시공휴일' },
    ], new Date(), 'v2');
    expect((await repo.addedClosureEvents()).map((event) => event.date)).toEqual(['2026-10-06']);
    expect((await repo.status([2026]))[0].version).toBe('v2');
  });
  it('records one change when the API repeats the same holiday date', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-10-05', name: '휴일' }], new Date(), 'v1');
    await repo.replaceYear(2026, [
      { date: '2026-10-05', name: '휴일' },
      { date: '2026-10-06', name: '임시휴일' },
      { date: '2026-10-06', name: '임시휴일 중복' },
    ], new Date(), 'v2');
    expect((await repo.addedClosureEvents()).map((event) => event.date)).toEqual(['2026-10-06']);
  });
  it('does not announce closures that were already weekends, May 1, or manual closures', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-10-05', name: '기존' }], new Date(), 'v1');
    await repo.setException('2026-10-06', true, '운영 휴일', '공지', 'actor', '사유');
    await repo.replaceYear(2026, [
      { date: '2026-10-05', name: '기존' },
      { date: '2026-10-06', name: '운영 휴일과 중복' },
      { date: '2026-05-01', name: '근로자의 날과 중복' },
      { date: '2026-10-03', name: '주말' },
    ], new Date(), 'v2');
    expect((await repo.addedClosureEvents()).map((event) => event.date)).toEqual(['2026-10-06']);
  });
  it('does not announce a manual closure on a weekend or May 1', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [], new Date(), 'v1');
    await repo.setException('2026-05-01', true, '근로자의 날', '공지', 'actor', '사유');
    await repo.setException('2026-10-03', true, '주말', '공지', 'actor', '사유');
    await repo.setException('2026-10-06', true, '임시휴일', '공지', 'actor', '사유');
    expect((await repo.addedClosureEvents()).map((event) => event.date)).toEqual(['2026-10-06']);
  });
  it('reads a covered year with official and manual closure days', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-10-05', name: '대체공휴일' }], new Date('2026-09-26T00:00:00Z'), 'v1');
    await repo.setException('2026-10-06', true, '임시공휴일', '운영 공지', 'actor-1', '긴급 공지');
    const calendar = await repo.read('2026-09-26', '2026-10-26');
    expect(calendar?.coveredFrom).toBe('2026-01-01');
    expect(calendar?.coveredThrough).toBe('2026-12-31');
    expect([...calendar!.holidays]).toEqual(['2026-10-05', '2026-10-06']);
    expect(calendar?.version).toContain('v1');
  });

  it('fails closed if any year in the requested interval is missing', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-12-25', name: '성탄절' }], new Date(), 'v1');
    expect(await repo.read('2026-12-20', '2027-01-20')).toBeNull();
  });
  it('does not let an older sync overwrite a newer holiday snapshot', async () => {
    const repo = new DrizzleBusinessCalendarRepository(db);
    await repo.replaceYear(2026, [{ date: '2026-10-06', name: '임시공휴일' }], new Date('2026-09-26T02:00:00Z'), 'new');
    await repo.replaceYear(2026, [], new Date('2026-09-26T01:00:00Z'), 'old');
    expect((await repo.status([2026]))[0].version).toBe('new');
    expect((await repo.read('2026-10-01', '2026-10-10'))?.holidays.has('2026-10-06')).toBe(true);
  });
});
