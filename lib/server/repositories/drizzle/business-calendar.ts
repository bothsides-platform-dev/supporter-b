import type { BusinessCalendar } from '@/lib/rfp/business-deadline';
import type { OfficialHoliday } from '@/lib/server/calendar/official';
import type { Tx } from '../types';
import { and, gte, inArray, lte, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { businessCalendarChanges, businessCalendarExceptionAudit, businessCalendarExceptions, businessCalendarYears, businessCalendarWriteLock } from '@/lib/db/schema';

export class DrizzleBusinessCalendarRepository {
  constructor(private readonly db: Tx) {}
  private h(tx?: Tx): Tx { return tx ?? this.db; }
  private async lockWrites(tx: Tx): Promise<void> {
    await tx.insert(businessCalendarWriteLock).values({ id: 'calendar' }).onConflictDoNothing();
    await tx.select({ id: businessCalendarWriteLock.id }).from(businessCalendarWriteLock)
      .where(inArray(businessCalendarWriteLock.id, ['calendar'])).for('update');
  }
  async status(years: number[], tx?: Tx): Promise<{ year: number; fetchedAt: Date; version: string }[]> {
    if (years.length === 0) return [];
    return this.h(tx).select({ year: businessCalendarYears.year, fetchedAt: businessCalendarYears.fetchedAt, version: businessCalendarYears.version })
      .from(businessCalendarYears).where(inArray(businessCalendarYears.year, years));
  }
  async addedClosureEvents(tx?: Tx): Promise<{ id: string; date: string; name: string; createdAt: Date }[]> {
    return this.h(tx).select({ id: businessCalendarChanges.id, date: businessCalendarChanges.date, name: businessCalendarChanges.name, createdAt: businessCalendarChanges.createdAt })
      .from(businessCalendarChanges).orderBy(asc(businessCalendarChanges.createdAt), asc(businessCalendarChanges.date));
  }
  async replaceYear(year: number, days: OfficialHoliday[], fetchedAt: Date, version: string, tx?: Tx): Promise<void> {
    if (!tx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.db as any).transaction((inner: Tx) => this.replaceYear(year, days, fetchedAt, version, inner));
      return;
    }
    await this.lockWrites(tx);
    const uniqueDays = [...new Map(days.map((day) => [day.date, day])).values()];
    const [previous] = await this.h(tx).select({ holidays: businessCalendarYears.holidays, fetchedAt: businessCalendarYears.fetchedAt }).from(businessCalendarYears)
      .where(inArray(businessCalendarYears.year, [year]));
    if (previous && previous.fetchedAt.getTime() > fetchedAt.getTime()) return;
    const oldDates = new Set(previous?.holidays.map((day) => day.date) ?? []);
    const closedExceptions = await this.h(tx).select({ date: businessCalendarExceptions.date, closed: businessCalendarExceptions.closed })
      .from(businessCalendarExceptions)
      .where(and(gte(businessCalendarExceptions.date, `${year}-01-01`), lte(businessCalendarExceptions.date, `${year}-12-31`)));
    const alreadyClosed = new Set(closedExceptions.filter((day) => day.closed).map((day) => day.date));
    await this.h(tx).insert(businessCalendarYears).values({
      year, holidays: uniqueDays, source: 'KASI getRestDeInfo', fetchedAt, version,
    }).onConflictDoUpdate({
      target: businessCalendarYears.year,
      set: { holidays: uniqueDays, fetchedAt, version, source: 'KASI getRestDeInfo' },
    });
    if (previous) {
      const added = uniqueDays.filter((day) =>
        !oldDates.has(day.date) && !alreadyClosed.has(day.date) && !day.date.endsWith('-05-01') &&
        ![0, 6].includes(new Date(`${day.date}T00:00:00Z`).getUTCDay()));
      if (added.length > 0) await this.h(tx).insert(businessCalendarChanges).values(added.map((day) => ({
        id: randomUUID(), date: day.date, name: day.name, source: 'KASI getRestDeInfo', version,
      })));
    }
  }
  async setException(date: string, closed: boolean, name: string, source: string, actor: string, reason: string, tx?: Tx): Promise<void> {
    if (!tx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.db as any).transaction((inner: Tx) => this.setException(date, closed, name, source, actor, reason, inner));
      return;
    }
    await this.lockWrites(tx);
    const [previous] = await this.h(tx).select({ closed: businessCalendarExceptions.closed }).from(businessCalendarExceptions)
      .where(and(gte(businessCalendarExceptions.date, date), lte(businessCalendarExceptions.date, date)));
    const [year] = await this.h(tx).select({ holidays: businessCalendarYears.holidays }).from(businessCalendarYears)
      .where(inArray(businessCalendarYears.year, [Number(date.slice(0, 4))]));
    const alreadyClosed = !!previous?.closed || !!year?.holidays.some((day) => day.date === date);
    await this.h(tx).insert(businessCalendarExceptions).values({ date, closed: closed ? 1 : 0, name, source, actor })
      .onConflictDoUpdate({ target: businessCalendarExceptions.date, set: { closed: closed ? 1 : 0, name, source, actor, changedAt: new Date() } });
    await this.h(tx).insert(businessCalendarExceptionAudit).values({
      id: randomUUID(), date, closed: closed ? 1 : 0, name, source, actor, reason,
    });
    if (closed && !alreadyClosed && !date.endsWith('-05-01') &&
        ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) await this.h(tx).insert(businessCalendarChanges).values({
      id: randomUUID(), date, name, source, version: `manual:${Date.now()}`,
    });
  }
  async read(from: string, through: string, tx?: Tx): Promise<BusinessCalendar | null> {
    const first = Number(from.slice(0, 4));
    const last = Number(through.slice(0, 4));
    if (!Number.isInteger(first) || !Number.isInteger(last) || last < first || last - first > 2) return null;
    const years = await this.h(tx).select().from(businessCalendarYears)
      .where(and(gte(businessCalendarYears.year, first), lte(businessCalendarYears.year, last)));
    if (years.length !== last - first + 1) return null;
    const exceptions = await this.h(tx).select().from(businessCalendarExceptions)
      .where(and(gte(businessCalendarExceptions.date, `${first}-01-01`), lte(businessCalendarExceptions.date, `${last}-12-31`)));
    const holidays = new Set(years.flatMap((row) => row.holidays.map((day) => day.date)));
    for (const exception of exceptions) {
      if (exception.closed) holidays.add(exception.date);
    }
    return {
      coveredFrom: `${first}-01-01`, coveredThrough: `${last}-12-31`, holidays,
      version: [...years.map((year) => `${year.year}:${year.version}`), ...exceptions.map((day) => `${day.date}:${day.changedAt.toISOString()}`)].sort().join('|'),
    };
  }
}
