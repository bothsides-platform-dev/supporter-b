import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('calendar DDL is repeatable and preserves audit and prior-year rows', async () => {
  const sql = readFileSync(resolve(process.cwd(), 'scripts/migrations/business-calendar.sql'), 'utf8')
    .replace(/^\\set ON_ERROR_STOP on\n/, '');
  const db = new PGlite();
  try {
    await db.exec("CREATE TYPE outbox_event AS ENUM ('rfp.sent'); CREATE TABLE rfps (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY); CREATE TABLE workspaces (id uuid PRIMARY KEY); CREATE TABLE rfp_pg_reviews (status text NOT NULL CONSTRAINT rfp_pg_review_status CHECK (status IN ('requested', 'reviewing', 'quoted', 'rejected', 'withdrawn')))");
    await db.exec(sql);
    await db.exec("INSERT INTO business_calendar_write_lock (id) VALUES ('calendar')");
    await db.exec("INSERT INTO business_calendar_years VALUES (2025, '[]', 'KASI', 'v1', now())");
    await db.exec("INSERT INTO business_calendar_exception_audit (id,date,closed,name,source,actor,reason) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','2026-10-05',1,'임시공휴일','공고','ops','사유')");
    await db.exec(sql);
    expect((await db.query('SELECT year FROM business_calendar_years')).rows).toEqual([{ year: 2025 }]);
    expect((await db.query('SELECT id FROM business_calendar_write_lock')).rows).toEqual([{ id: 'calendar' }]);
    expect((await db.query('SELECT reason FROM business_calendar_exception_audit')).rows).toEqual([{ reason: '사유' }]);
    expect((await db.query("SELECT enumlabel FROM pg_enum WHERE enumtypid = 'outbox_event'::regtype AND enumlabel = 'rfp.calendar_changed'")).rows)
      .toEqual([{ enumlabel: 'rfp.calendar_changed' }]);
    await db.exec("INSERT INTO rfp_pg_reviews (status) VALUES ('buyer_ended')");
  } finally {
    await db.close();
  }
});
