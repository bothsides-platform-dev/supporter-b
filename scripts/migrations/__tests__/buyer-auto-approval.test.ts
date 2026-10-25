import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds API provenance idempotently without approving existing applications', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TYPE grade_source AS ENUM ('user_confirmed','user_overridden','unset','admin_confirmed');
      CREATE TABLE biz_profiles (grade_source grade_source);
      CREATE TABLE workspaces (status text);
      CREATE TABLE verification_applications (status text);
      INSERT INTO biz_profiles VALUES ('unset');
      INSERT INTO workspaces VALUES ('pending');
      INSERT INTO verification_applications VALUES ('submitted');
    `);
    const ddl = readFileSync('scripts/migrations/20261020-buyer-auto-approval.sql', 'utf8');
    await pg.exec(ddl);
    await pg.exec(ddl);
    expect((await pg.query('SELECT status FROM workspaces')).rows).toEqual([{ status: 'pending' }]);
    expect((await pg.query('SELECT status FROM verification_applications')).rows).toEqual([{ status: 'submitted' }]);
    expect((await pg.query('SELECT grade_source FROM biz_profiles')).rows).toEqual([{ grade_source: 'unset' }]);
    await pg.exec("INSERT INTO biz_profiles VALUES ('api_confirmed')");
    expect((await pg.query("SELECT grade_source FROM biz_profiles WHERE grade_source='api_confirmed'")).rows)
      .toEqual([{ grade_source: 'api_confirmed' }]);
  } finally {
    await pg.close();
  }
});

it('adds new-business exception provenance idempotently and preserves existing grades', async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE TYPE grade_source AS ENUM ('api_confirmed'); CREATE TABLE profiles (source grade_source); INSERT INTO profiles VALUES ('api_confirmed');");
    const ddl = readFileSync('scripts/migrations/20261025-new-business-approval.sql', 'utf8');
    await pg.exec(ddl);
    await pg.exec(ddl);
    await pg.exec("INSERT INTO profiles VALUES ('new_business_exception')");
    expect((await pg.query('SELECT source FROM profiles')).rows).toEqual([{ source: 'api_confirmed' }, { source: 'new_business_exception' }]);
  } finally { await pg.close(); }
});
