import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
it('자동 입력 DDL은 재실행 가능하며 중복 선점·종류·초안 수명을 강제한다', async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE TABLE guest_rfp_drafts(id uuid PRIMARY KEY); INSERT INTO guest_rfp_drafts VALUES ('aaaaaaaa-0000-4000-8000-000000000001')");
    const ddl = readFileSync('scripts/migrations/20261029-guest-quote-assist.sql', 'utf8');
    await pg.exec(ddl); await pg.exec(ddl);
    const insert = "INSERT INTO guest_quote_calls(draft_id, kind, input_hash, created_at, expires_at) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','business','hash',now(),now()+interval '1 day')";
    await pg.exec(insert);
    await expect(pg.exec(insert)).rejects.toThrow(/duplicate key/);
    await expect(pg.exec(insert.replace("'business'", "'other'"))).rejects.toThrow(/check constraint/);
    await pg.exec("DELETE FROM guest_rfp_drafts");
    expect((await pg.query('SELECT count(*)::int AS n FROM guest_quote_calls')).rows).toEqual([{ n: 0 }]);
  } finally { await pg.close(); }
});
