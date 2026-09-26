import { date, integer, jsonb, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const businessCalendarWriteLock = pgTable('business_calendar_write_lock', {
  id: text('id').primaryKey(),
});

export const businessCalendarYears = pgTable('business_calendar_years', {
  year: integer('year').primaryKey(),
  holidays: jsonb('holidays').$type<{ date: string; name: string }[]>().notNull(),
  source: text('source').notNull(),
  version: text('version').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
});

export const businessCalendarExceptions = pgTable('business_calendar_exceptions', {
  date: date('date').primaryKey(),
  closed: integer('closed').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(),
  actor: text('actor').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessCalendarExceptionAudit = pgTable('business_calendar_exception_audit', {
  id: uuid('id').primaryKey(),
  date: date('date').notNull(),
  closed: integer('closed').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(),
  actor: text('actor').notNull(),
  reason: text('reason').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('business_calendar_exception_audit_date_idx').on(t.date)]);

export const businessCalendarChanges = pgTable('business_calendar_changes', {
  id: uuid('id').primaryKey(),
  date: date('date').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(),
  version: text('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('business_calendar_changes_date_idx').on(t.date)]);
