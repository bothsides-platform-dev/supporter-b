import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('기본 추천 DDL은 기존 업종을 보존하고 재실행·MCC 중복·싱글턴을 검증한다', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY, name text NOT NULL UNIQUE);
      INSERT INTO pg_recommendation_groups VALUES ('00000000-0000-4000-8000-000000000001', '기존 업종');`);
    const ddl = readFileSync('scripts/sql/20260924-pg-matching-defaults.sql', 'utf8').replace(/^\\set.*$/gm, '');
    await db.exec(ddl);
    await db.exec(ddl);
    expect((await db.query('SELECT name, mcc_code FROM pg_recommendation_groups')).rows).toEqual([{ name: '기존 업종', mcc_code: null }]);
    await db.exec(`UPDATE pg_recommendation_groups SET mcc_code = '5651';`);
    await expect(db.exec(`INSERT INTO pg_recommendation_groups (id, name, mcc_code) VALUES ('00000000-0000-4000-8000-000000000002', '중복', '5651');`)).rejects.toThrow();
    await db.exec(`INSERT INTO pg_matching_defaults (policy) VALUES ('{"risk":"gray","candidates":[]}');`);
    await expect(db.exec(`INSERT INTO pg_matching_defaults (id, policy) VALUES ('another', '{}');`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO pg_matching_defaults (policy) VALUES ('{}');`)).rejects.toThrow();
  } finally {
    await db.close();
  }
});
