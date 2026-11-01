import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('기존 0을 보존하고 미정 비용 NULL·개인별 초안·계정 삭제를 지원하며 재실행해도 보존한다', async () => {
  const ddl = readFileSync(resolve(process.cwd(), 'scripts/migrations/20261101-pg-workspace-v2.sql'), 'utf8');
  const db = new PGlite();
  const user = 'aaaaaaaa-0000-4000-8000-000000000001';
  const other = 'aaaaaaaa-0000-4000-8000-000000000002';
  const workspace = 'bbbbbbbb-0000-4000-8000-000000000001';
  const rfp = 'cccccccc-0000-4000-8000-000000000001';
  try {
    await db.exec(`CREATE TABLE users (id uuid PRIMARY KEY); CREATE TABLE workspaces (id uuid PRIMARY KEY); CREATE TABLE rfps (id uuid PRIMARY KEY);
      CREATE TABLE bids (id uuid PRIMARY KEY, signup_fee numeric NOT NULL DEFAULT 0, guarantee_insurance numeric NOT NULL DEFAULT 0, quote_terms jsonb NOT NULL DEFAULT '{"_v":1}');
      INSERT INTO users VALUES ('${user}'), ('${other}'); INSERT INTO workspaces VALUES ('${workspace}'); INSERT INTO rfps VALUES ('${rfp}');
      INSERT INTO bids (id) VALUES ('dddddddd-0000-4000-8000-000000000001');`);
    await db.exec(ddl);
    expect((await db.query('SELECT signup_fee::text, guarantee_insurance::text, quote_terms FROM bids')).rows).toEqual([{ signup_fee: '0', guarantee_insurance: '0', quote_terms: { _v: 1 } }]);
    await db.exec("INSERT INTO bids (id) VALUES ('dddddddd-0000-4000-8000-000000000002')");
    expect((await db.query("SELECT signup_fee, guarantee_insurance FROM bids WHERE id='dddddddd-0000-4000-8000-000000000002'")).rows).toEqual([{ signup_fee: null, guarantee_insurance: null }]);
    for (const owner of [user, other]) {
      await db.query("INSERT INTO bid_drafts (user_id,workspace_id,rfp_id,round_key,content) VALUES ($1,$2,$3,'initial',$4)", [owner,workspace,rfp,JSON.stringify({ memo: owner })]);
    }
    await expect(db.query("INSERT INTO bid_drafts (user_id,workspace_id,rfp_id,round_key,content) VALUES ($1,$2,$3,'initial','{}')", [user,workspace,rfp])).rejects.toThrow(/bid_drafts_scope_unique/);
    await db.exec(ddl);
    expect((await db.query('SELECT revision FROM bid_drafts')).rows).toEqual([{ revision: 1 }, { revision: 1 }]);
    await db.query('DELETE FROM users WHERE id=$1', [user]);
    expect((await db.query('SELECT user_id, content FROM bid_drafts')).rows).toEqual([{ user_id: other, content: { memo: other } }]);
  } finally { await db.close(); }
});
