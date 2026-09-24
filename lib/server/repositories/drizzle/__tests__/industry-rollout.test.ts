import { createPgliteDb } from '@/lib/db/client-pglite';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('표준 업종을 한 번만 등록하고 중복·기존 정책·삭제를 보존한다', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, mcc_code text UNIQUE, mcc_version text, sort_order integer DEFAULT 0);
      CREATE TABLE pg_matching_policies (group_id uuid PRIMARY KEY, policy jsonb);
      CREATE TABLE rfp_matching_requests (rfp_id uuid PRIMARY KEY);
      INSERT INTO pg_recommendation_groups (id, name, mcc_code) VALUES
        ('10000000-0000-4000-8000-000000000001', '우리 식료품 업종', '5411'),
        ('10000000-0000-4000-8000-000000000002', '신발 판매', null);
      INSERT INTO pg_matching_policies VALUES ('10000000-0000-4000-8000-000000000001', '{"risk":"black","candidates":[]}');
      INSERT INTO rfp_matching_requests VALUES ('10000000-0000-4000-8000-000000000003');
    `);
    const migration = readFileSync('scripts/sql/20260924-custom-industries.sql', 'utf8').split('\n').filter(line => !line.startsWith('\\')).join('\n');
    await db.exec(migration);
    expect((await db.query('SELECT * FROM pg_recommendation_groups')).rows).toHaveLength(29);
    expect((await db.query("SELECT id, name FROM pg_recommendation_groups WHERE mcc_code='5411'")).rows).toEqual([{ id: '10000000-0000-4000-8000-000000000001', name: '우리 식료품 업종' }]);
    expect((await db.query('SELECT policy FROM pg_matching_policies')).rows).toEqual([{ policy: { risk: 'black', candidates: [] } }]);
    expect((await db.query('SELECT is_custom_industry FROM rfp_matching_requests')).rows).toEqual([{ is_custom_industry: false }]);
    await db.exec("DELETE FROM pg_recommendation_groups WHERE mcc_code='7999'");
    await db.exec(migration);
    expect((await db.query('SELECT * FROM pg_recommendation_groups')).rows).toHaveLength(28);
  } finally { await db.close(); }
});

it('스키마 동기화에도 일회성 등록 이력 테이블을 유지한다', async () => {
  const db = await createPgliteDb();
  const result = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='app_data_migrations'`);
  expect(result.rows).toEqual([{ tablename: 'app_data_migrations' }]);
});
