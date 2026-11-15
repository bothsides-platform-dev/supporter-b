import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';

const COLUMNS = `SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_name = 'admin_users' ORDER BY column_name`;
const CONSTRAINTS = `SELECT conname, contype FROM pg_constraint
  WHERE conrelid = 'admin_users'::regclass ORDER BY conname`;

it('관리자 계정 DDL은 재실행 가능하고 소문자·중복 이메일을 막는다', async () => {
  const pg = new PGlite();
  try {
    const ddl = readFileSync('scripts/migrations/20261115-admin-users.sql', 'utf8');
    await pg.exec(ddl); await pg.exec(ddl);
    await pg.exec("INSERT INTO admin_users (email, created_by) VALUES ('ops@example.com', 'migration:env')");
    await expect(pg.exec("INSERT INTO admin_users (email) VALUES ('ops@example.com')")).rejects.toThrow(/duplicate key/);
    await expect(pg.exec("INSERT INTO admin_users (email) VALUES ('Ops@Example.com')")).rejects.toThrow(/check constraint/);
  } finally { await pg.close(); }
});

it('관리자 계정 DDL은 drizzle 스키마와 같은 컬럼·제약을 만든다(이후 db:push no-op)', async () => {
  const fromSql = new PGlite();
  const fromSchema = new PGlite();
  try {
    await fromSql.exec(readFileSync('scripts/migrations/20261115-admin-users.sql', 'utf8'));
    const statement = (await generateSchemaDDL()).find((s) => s.includes('CREATE TABLE "admin_users"'));
    expect(statement).toBeDefined();
    await fromSchema.exec(statement!);
    expect((await fromSql.query(COLUMNS)).rows).toEqual((await fromSchema.query(COLUMNS)).rows);
    expect((await fromSql.query(CONSTRAINTS)).rows).toEqual((await fromSchema.query(CONSTRAINTS)).rows);
  } finally { await fromSql.close(); await fromSchema.close(); }
});
