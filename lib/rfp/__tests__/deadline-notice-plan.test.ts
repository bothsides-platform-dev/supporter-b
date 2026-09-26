import { describe, expect, it } from 'vitest';
import { planDeadlineNotices } from '../deadline-notice-plan';

const calendar = { coveredFrom: '2026-01-01', coveredThrough: '2026-12-31', holidays: new Set<string>() };

describe('deadline notices', () => {
  it('uses each PG pending round and suppresses already submitted rounds', () => {
    const plan = planDeadlineNotices({
      now: new Date('2026-10-01T00:00:00Z'), commonDeadline: '2026-10-02T09:00:00.000Z',
      calendar, pgIds: ['a', 'b', 'c'],
      pending: [
        { id: 'r-a', pgWsId: 'a', round: 2, deadline: '2026-10-02T09:00:00.000Z' },
        { id: 'r-b', pgWsId: 'b', round: 3, deadline: '2026-10-05T09:00:00.000Z' },
      ],
      submitted: [{ pgWsId: 'b', round: 3 }, { pgWsId: 'c', round: 1 }],
    });
    expect(plan.reminders).toEqual([{ pgWsId: 'a', round: 2, deadline: '2026-10-02T09:00:00.000Z', requoteId: 'r-a' }]);
    expect(plan.closed).toBe(false);
  });

  it('closes only after common and every pending deadline pass', () => {
    const args = {
      now: new Date('2026-10-03T00:00:00Z'), commonDeadline: '2026-10-02T09:00:00.000Z',
      calendar, pgIds: ['a'], pending: [{ id: 'r-a', pgWsId: 'a', round: 2, deadline: '2026-10-05T09:00:00.000Z' }], submitted: [],
    };
    expect(planDeadlineNotices(args).closed).toBe(false);
    expect(planDeadlineNotices({ ...args, now: new Date('2026-10-05T09:00:00Z') }).closed).toBe(true);
  });
  it('skips a reminder when the preceding year is unverified', () => {
    const plan = planDeadlineNotices({
      now: new Date('2027-01-01T00:00:00Z'), commonDeadline: '2027-01-04T09:00:00.000Z',
      calendar: { coveredFrom: '2027-01-01', coveredThrough: '2027-12-31', holidays: new Set(['2027-01-01']) },
      pgIds: ['a'], pending: [], submitted: [],
    });
    expect(plan).toEqual({ reminders: [], closed: false });
  });
});
