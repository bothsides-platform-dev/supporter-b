import { describe, expect, it } from 'vitest';
import { businessDeadline, validateBusinessDeadline } from '../business-deadline';

const calendar = {
  coveredThrough: '2027-12-31',
  holidays: new Set(['2026-09-28', '2026-10-05', '2027-05-05']),
};

describe('Korean business deadlines', () => {
  it('counts from the day after a Friday request and excludes holidays', () => {
    const now = new Date('2026-09-25T08:00:00Z');
    expect(businessDeadline(now, 3, calendar)).toBe('2026-10-01T09:00:00.000Z');
  });

  it('treats May 1 as closed without a substitute day', () => {
    const now = new Date('2027-04-29T02:00:00Z');
    expect(businessDeadline(now, 3, calendar)).toBe('2027-05-04T09:00:00.000Z');
  });

  it('enforces 18:00 KST, minimum three business days and 30 calendar days', () => {
    const now = new Date('2026-09-25T08:00:00Z');
    expect(validateBusinessDeadline(now, new Date('2026-09-30T09:00:00Z'), calendar)).toBe('TOO_SOON');
    expect(validateBusinessDeadline(now, new Date('2026-10-01T08:59:59Z'), calendar)).toBe('INVALID_TIME');
    expect(validateBusinessDeadline(now, new Date('2026-10-26T09:00:00Z'), calendar)).toBe('TOO_LATE');
    expect(validateBusinessDeadline(now, new Date('2026-10-01T09:00:00Z'), calendar)).toBeNull();
  });

  it('fails closed when the calendar does not cover the candidate date', () => {
    const now = new Date('2026-12-29T01:00:00Z');
    expect(validateBusinessDeadline(now, new Date('2027-01-05T09:00:00Z'), {
      ...calendar,
      coveredThrough: '2026-12-31',
    })).toBe('CALENDAR_UNAVAILABLE');
  });

  it('uses the Korean request date across UTC midnight and handles a weekday May 1', () => {
    const now = new Date('2026-04-30T15:30:00Z'); // May 1 in Seoul
    expect(businessDeadline(now, 3, calendar)).toBe('2026-05-06T09:00:00.000Z');
  });

  it('rejects a holiday selected directly', () => {
    expect(validateBusinessDeadline(
      new Date('2026-09-25T08:00:00Z'),
      new Date('2026-10-05T09:00:00Z'),
      calendar,
    )).toBe('HOLIDAY');
  });

  it('accepts the 30th calendar day when it is a business day', () => {
    const now = new Date('2026-09-01T01:00:00Z');
    expect(validateBusinessDeadline(now, new Date('2026-10-01T09:00:00Z'), calendar)).toBeNull();
  });

  it('uses the Korean request date on each side of midnight', () => {
    const spring = { coveredThrough: '2026-12-31', holidays: new Set(['2026-05-05']) };
    expect(businessDeadline(new Date('2026-04-29T14:59:00Z'), 3, spring))
      .toBe('2026-05-06T09:00:00.000Z');
    expect(businessDeadline(new Date('2026-04-29T15:00:00Z'), 3, spring))
      .toBe('2026-05-07T09:00:00.000Z');
  });

  it('starts a weekend request count on the following business day', () => {
    expect(businessDeadline(new Date('2026-09-26T04:00:00Z'), 3, calendar))
      .toBe('2026-10-01T09:00:00.000Z');
  });

  it('skips Seollal, Chuseok, substitute and temporary holidays from fixtures', () => {
    const fixture = {
      coveredThrough: '2026-12-31',
      holidays: new Set([
        '2026-02-16', '2026-02-17', '2026-02-18', // Seollal
        '2026-09-24', '2026-09-25', '2026-09-26', // Chuseok
        '2026-09-28', // substitute
        '2026-09-29', // temporary
      ]),
    };
    expect(businessDeadline(new Date('2026-02-13T02:00:00Z'), 3, fixture))
      .toBe('2026-02-23T09:00:00.000Z');
    expect(businessDeadline(new Date('2026-09-23T02:00:00Z'), 3, fixture))
      .toBe('2026-10-02T09:00:00.000Z');
  });

  it('does not invent a Monday substitute when May 1 falls on Saturday', () => {
    expect(businessDeadline(new Date('2027-04-29T02:00:00Z'), 2, {
      coveredThrough: '2027-12-31', holidays: new Set<string>(),
    })).toBe('2027-05-03T09:00:00.000Z');
  });

  it('crosses New Year without treating a missing year as open', () => {
    const full = { coveredThrough: '2027-12-31', holidays: new Set(['2027-01-01']) };
    expect(businessDeadline(new Date('2026-12-30T02:00:00Z'), 3, full))
      .toBe('2027-01-05T09:00:00.000Z');
    expect(() => businessDeadline(new Date('2026-12-30T02:00:00Z'), 3, {
      ...full, coveredThrough: '2026-12-31',
    })).toThrow('CALENDAR_UNAVAILABLE');
  });

  it('counts leap day as a business day and skips March 1', () => {
    expect(businessDeadline(new Date('2028-02-28T02:00:00Z'), 3, {
      coveredThrough: '2028-12-31', holidays: new Set(['2028-03-01']),
    })).toBe('2028-03-03T09:00:00.000Z');
  });
});
