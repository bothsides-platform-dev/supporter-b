import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { expect, it } from 'vitest';
import * as calendar from '@/lib/db/schema/business-calendar';

const tables = ['business_calendar_exceptions', 'business_calendar_exception_audit'];
const migration = () => readFileSync('scripts/migrations/20261019-calendar-closed-checks.sql', 'utf8');
async function legacy(pg: PGlite) {
  for (const table of tables) await pg.exec(`CREATE TABLE ${table} (closed integer NOT NULL, note text);
    INSERT INTO ${table} VALUES (0, 'existing open'), (1, 'existing closed')`);
}
async function constraints(pg: PGlite) {
  return (await pg.query<{ conname: string; definition: string; convalidated: boolean }>(`SELECT conname, pg_get_constraintdef(oid) AS definition, convalidated
    FROM pg_constraint WHERE conname IN ('business_calendar_exceptions_closed_check',
    'business_calendar_exception_audit_closed_check') ORDER BY conname`)).rows;
}

it('repairs both existing tables, preserves rows and rejects non-boolean integers after repeated runs', async () => {
  const pg = new PGlite();
  try {
    await legacy(pg);
    await pg.exec(migration());
    await pg.exec(migration());
    for (const table of tables) {
      expect((await pg.query(`SELECT * FROM ${table} ORDER BY closed`)).rows).toEqual([
        { closed: 0, note: 'existing open' }, { closed: 1, note: 'existing closed' },
      ]);
      for (const value of [-1, 2, 42]) {
        await expect(pg.exec(`INSERT INTO ${table} VALUES (${value}, 'invalid')`)).rejects.toThrow(/check constraint/);
      }
      await pg.exec(`INSERT INTO ${table} VALUES (0, 'new open'), (1, 'new closed')`);
    }
    const repaired = await constraints(pg);
    const fresh = new PGlite();
    try {
      const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(calendar));
      await fresh.exec(ddl.join('\n'));
      expect(await constraints(fresh)).toEqual(repaired);
      expect(repaired).toHaveLength(2);
      expect(repaired.every((row) => row.convalidated === true)).toBe(true);
    } finally { await fresh.close(); }
  } finally { await pg.close(); }
});

it.each(tables)('stops atomically when %s has a conflicting named constraint', async (table) => {
  const pg = new PGlite();
  try {
    await legacy(pg);
    await pg.exec(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_closed_check CHECK (closed IN (0, 1, 2))`);
    await expect(pg.exec(migration())).rejects.toThrow(/Unexpected constraint definition/);
    await pg.exec('ROLLBACK');
    expect(await constraints(pg)).toHaveLength(1);
    await pg.exec(`INSERT INTO ${table} VALUES (2, 'unchanged')`);
  } finally { await pg.close(); }
});

it.each(tables)('does not repair or discard invalid existing data in %s', async (table) => {
  const pg = new PGlite();
  try {
    await legacy(pg);
    await pg.exec(`INSERT INTO ${table} VALUES (2, 'preserve invalid row')`);
    await expect(pg.exec(migration())).rejects.toThrow(/check constraint/);
    await pg.exec('ROLLBACK');
    expect(await constraints(pg)).toEqual([]);
    expect((await pg.query(`SELECT note FROM ${table} WHERE closed = 2`)).rows)
      .toEqual([{ note: 'preserve invalid row' }]);
  } finally { await pg.close(); }
});

it('validates an existing matching NOT VALID constraint', async () => {
  const pg = new PGlite();
  try {
    await legacy(pg);
    for (const table of tables) await pg.exec(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_closed_check CHECK (closed IN (0, 1)) NOT VALID`);
    await pg.exec(migration());
    expect((await constraints(pg)).every((row) => row.convalidated === true)).toBe(true);
  } finally { await pg.close(); }
});
