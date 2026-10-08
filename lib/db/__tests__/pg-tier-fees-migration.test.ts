import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
it('기본·업종 요율만 비우고 순서·조건·이력을 보존하며 재실행은 새 판가를 지우지 않는다', async () => {
 const sql = readFileSync(resolve(process.cwd(), 'scripts/sql/20261008-pg-tier-fees.sql'), 'utf8').replace(/^\\set.*$/gm, '');
 const db = new PGlite();
 const candidates = [
  { pgWorkspaceId: 'pg2', reason: '우선 추천', feeMin: 0, feeMax: 1, feeNote: '카드' },
  { pgWorkspaceId: 'pg1', reason: '다음 추천', feeMin: null, feeMax: null, feeNote: '조건 유지' },
 ];
 const policy = { risk: 'white', candidates };
 try {
  await db.exec(`CREATE TABLE pg_matching_policies (group_id text PRIMARY KEY, policy jsonb, updated_at timestamptz DEFAULT now());
   CREATE TABLE pg_matching_defaults (id text PRIMARY KEY, policy jsonb, updated_at timestamptz DEFAULT now());
   CREATE TABLE rfp_pg_reviews (candidate jsonb); CREATE TABLE admin_audit_logs (payload_json jsonb);`);
  await db.query('INSERT INTO pg_matching_policies VALUES ($1, $2)', ['group', JSON.stringify(policy)]);
  await db.query('INSERT INTO pg_matching_policies VALUES ($1, $2)', ['empty', JSON.stringify({ risk: 'black', candidates: [] })]);
  await db.query('INSERT INTO pg_matching_defaults VALUES ($1, $2)', ['default', JSON.stringify({ ...policy, risk: 'gray' })]);
  await db.query('INSERT INTO rfp_pg_reviews VALUES ($1)', [JSON.stringify(candidates[0])]);
  await db.query('INSERT INTO admin_audit_logs VALUES ($1)', [JSON.stringify(policy)]);
  await db.exec(sql);
  const expected = [
   { pgWorkspaceId: 'pg2', reason: '우선 추천', feesByTier: { sole: null, sme1: null, sme2: null, sme3: null, general: null }, feeNote: '카드' },
   { pgWorkspaceId: 'pg1', reason: '다음 추천', feesByTier: { sole: null, sme1: null, sme2: null, sme3: null, general: null }, feeNote: '조건 유지' },
  ];
  expect((await db.query("SELECT policy FROM pg_matching_policies WHERE group_id='group'")).rows).toEqual([{ policy: { risk: 'white', candidates: expected } }]);
  expect((await db.query('SELECT policy FROM pg_matching_defaults')).rows).toEqual([{ policy: { risk: 'gray', candidates: expected } }]);
  expect((await db.query("SELECT policy FROM pg_matching_policies WHERE group_id='empty'")).rows).toEqual([{ policy: { risk: 'black', candidates: [] } }]);
  await db.exec("UPDATE pg_matching_defaults SET policy=jsonb_set(policy, '{candidates,0,feesByTier,sme1}', '1.2')");
  await db.exec(sql);
  expect((await db.query("SELECT policy #> '{candidates,0,feesByTier,sme1}' AS fee FROM pg_matching_defaults")).rows).toEqual([{ fee: 1.2 }]);
  expect((await db.query('SELECT candidate FROM rfp_pg_reviews')).rows).toEqual([{ candidate: candidates[0] }]);
  expect((await db.query('SELECT payload_json FROM admin_audit_logs')).rows).toEqual([{ payload_json: policy }]);
  expect((await db.query('SELECT id FROM app_data_migrations')).rows).toEqual([{ id: '20261008-pg-tier-fees' }]);
 } finally { await db.close(); }
});
