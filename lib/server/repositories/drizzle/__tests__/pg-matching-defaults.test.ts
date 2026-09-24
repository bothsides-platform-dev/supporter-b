import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DrizzlePgMatchingRepository } from '../pg-matching';
import type { Tx } from '../../types';

let client: PGlite;
let repo: DrizzlePgMatchingRepository;
const group = '10000000-0000-4000-8000-000000000001';
const primary = '20000000-0000-4000-8000-000000000001';
const fallback = '20000000-0000-4000-8000-000000000002';
const candidate = (pgWorkspaceId: string) => ({ pgWorkspaceId, reason: '사업 조건 상담', feeMin: null, feeMax: null, feeNote: '' });
beforeEach(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY, name text);
    CREATE TABLE pg_matching_policies (group_id uuid PRIMARY KEY, policy jsonb);
    CREATE TABLE pg_matching_defaults (id text PRIMARY KEY, policy jsonb);
    CREATE TABLE workspaces (id uuid PRIMARY KEY, name text, type text, status text);
    INSERT INTO pg_recommendation_groups VALUES ('${group}', '의류');
    INSERT INTO workspaces VALUES ('${primary}', '업종 PG', 'pg', 'active'), ('${fallback}', '기본 PG', 'pg', 'active');
  `);
  await client.query('INSERT INTO pg_matching_defaults VALUES ($1, $2)', ['default', JSON.stringify({ risk: 'gray', candidates: [candidate(fallback)] })]);
  repo = new DrizzlePgMatchingRepository(drizzle(client) as unknown as Tx);
});
afterEach(async () => client.close());
async function policy(risk: string, ids: string[]) {
  await client.query('INSERT INTO pg_matching_policies VALUES ($1, $2)', [group, JSON.stringify({ risk, candidates: ids.map(candidate) })]);
}
it('업종 정책이 없으면 기본 PG를 추가 검토 후보로 추천한다', async () => {
  expect(await repo.recommendation(group)).toEqual({ risk: 'gray', industryName: '의류', source: 'default', candidates: [{ ...candidate(fallback), name: '기본 PG' }] });
});
it('업종 후보가 있으면 기본 후보를 섞지 않는다', async () => {
  await policy('white', [primary]);
  expect((await repo.recommendation(group)).candidates.map(c => c.pgWorkspaceId)).toEqual([primary]);
});
it.each(['unconfigured', 'gray', 'white'])('%s 업종에 유효한 후보가 없으면 기본 후보로 이어진다', async risk => {
  await policy(risk, [primary]);
  await client.exec(`UPDATE workspaces SET status='suspended' WHERE id='${primary}'`);
  expect((await repo.recommendation(group)).candidates.map(c => c.pgWorkspaceId)).toEqual([fallback]);
});
it('접수 불가 업종과 존재하지 않는 업종은 기본 PG로 우회하지 않는다', async () => {
  await policy('black', [primary]);
  expect((await repo.recommendation(group)).candidates).toEqual([]);
  expect((await repo.recommendation('10000000-0000-4000-8000-000000000099')).candidates).toEqual([]);
});
it('다음 추천도 기본 후보를 쓰되 이전 상담 PG는 다시 추천하지 않는다', async () => {
  await policy('white', [primary]);
  expect((await repo.recommendation(group, [primary])).candidates.map(c => c.pgWorkspaceId)).toEqual([fallback]);
  expect((await repo.recommendation(group, [primary, fallback])).candidates).toEqual([]);
});
it('기본 후보도 승인 상태와 테스트 PG 숨김을 지킨다', async () => {
  await client.exec(`UPDATE workspaces SET name='테스트 PG' WHERE id='${fallback}'`);
  expect((await repo.recommendation(group)).candidates).toEqual([]);
  expect((await repo.recommendation(group, [], undefined, true)).candidates).toHaveLength(1);
  await client.exec(`UPDATE workspaces SET status='pending' WHERE id='${fallback}'`);
  expect((await repo.recommendation(group, [], undefined, true)).candidates).toEqual([]);
});
it('기본 설정이 없거나 손상되었으면 임의의 PG를 선택하지 않는다', async () => {
  await client.exec("UPDATE pg_matching_defaults SET policy='{}'");
  expect((await repo.recommendation(group)).candidates).toEqual([]);
  await client.exec('DELETE FROM pg_matching_defaults');
  expect((await repo.recommendation(group)).candidates).toEqual([]);
});

it('정규화된 이름이 중복 등록돼도 Black 업종을 임의의 다른 정책으로 우회하지 않는다', async () => {
  await policy('white', [primary]);
  const blocked = '10000000-0000-4000-8000-000000000002';
  await client.query('INSERT INTO pg_recommendation_groups VALUES ($1, $2)', [blocked, ' 의류 ']);
  await client.query('INSERT INTO pg_matching_policies VALUES ($1, $2)', [blocked, JSON.stringify({ risk: 'black', candidates: [] })]);
  const industry = await repo.resolveIndustry({ customIndustryName: '의류' });
  expect(await repo.recommendation(industry.groupId)).toMatchObject({ risk: 'black', candidates: [] });
});
