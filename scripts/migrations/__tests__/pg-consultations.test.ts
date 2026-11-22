import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';

it('구형 스키마에 두 번 적용한 배정 DDL과 새 설치의 컬럼·제약·판정 뷰가 같다', async () => {
  const sql = readFileSync('scripts/migrations/20261122-pg-consultations.sql', 'utf8');
  const current = new PGlite(),
    upgraded = new PGlite();
  try {
    const all = await generateSchemaDDL();
    for (const statement of all) await current.exec(statement);
    for (const statement of all.filter(
      (s) => !s.includes('"pg_consultation_') && !s.includes('"pg_assignment_policies"'),
    )) {
      await upgraded.exec(
        statement
          .replace(
            /^[ \t]*"(assignment|assignment_alimtalk_consent_at|assignment_consent|assignment_eligible)"[^\n]*,\n/gm,
            '',
          )
          .replace(", 'rfp.consultation'", ''),
      );
    }
    await upgraded.exec(sql);
    await upgraded.exec(sql);
    for (const query of [
      "select table_name,column_name,udt_name,is_nullable,column_default from information_schema.columns where table_name like 'pg_consultation_%' or table_name='pg_assignment_policies' or column_name in ('assignment','assignment_alimtalk_consent_at','assignment_consent','assignment_eligible') order by 1,2",
      "select conrelid::regclass::text,conname,pg_get_constraintdef(oid) from pg_constraint where conrelid::regclass::text like 'pg_consultation_%' or conrelid='pg_assignment_policies'::regclass order by 1,2",
      "select pg_get_viewdef('pg_consultation_progress'::regclass)",
    ])
      expect((await upgraded.query(query)).rows).toEqual((await current.query(query)).rows);
  } finally {
    await current.close();
    await upgraded.close();
  }
});
