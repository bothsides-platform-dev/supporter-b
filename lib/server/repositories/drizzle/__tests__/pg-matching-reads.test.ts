import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DrizzlePgMatchingRepository } from '../pg-matching';
import type { Tx } from '../../types';

// 추천 규칙은 lib/rfp/__tests__/pg-recommendation-rules.test.ts 가 pure 로 검증한다.
// 여기서는 규칙이 받는 행 읽기만 확인한다.
let client: PGlite;
let repo: DrizzlePgMatchingRepository;
const group = '10000000-0000-4000-8000-000000000001';
const orphan = '10000000-0000-4000-8000-000000000002';
const active = '20000000-0000-4000-8000-000000000001';
const suspended = '20000000-0000-4000-8000-000000000002';
const buyer = '30000000-0000-4000-8000-000000000001';
beforeEach(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY, name text);
    CREATE TABLE pg_matching_policies (group_id uuid PRIMARY KEY, policy jsonb);
    CREATE TABLE pg_matching_defaults (id text PRIMARY KEY, policy jsonb);
    CREATE TABLE workspaces (id uuid PRIMARY KEY, name text, type text, status text);
    INSERT INTO pg_recommendation_groups VALUES ('${orphan}', '정책 없음'), ('${group}', '의류');
    INSERT INTO workspaces VALUES
      ('${active}', '활성 PG', 'pg', 'active'),
      ('${suspended}', '정지 PG', 'pg', 'suspended'),
      ('${buyer}', '구매사', 'buyer', 'active');
  `);
  await client.query('INSERT INTO pg_matching_policies VALUES ($1, $2)', [group, JSON.stringify({ risk: 'white', candidates: [] })]);
  repo = new DrizzlePgMatchingRepository(drizzle(client) as unknown as Tx);
});
afterEach(async () => client.close());

it('업종 그룹은 id 순서로 정책 원문과 함께 읽고, 정책 행이 없으면 null 이다', async () => {
  expect(await repo.industryGroups()).toEqual([
    { id: group, name: '의류', policy: { risk: 'white', candidates: [] } },
    { id: orphan, name: '정책 없음', policy: null },
  ]);
  expect(await repo.groupPolicy(orphan)).toEqual({ name: '정책 없음', policy: null });
  expect(await repo.groupPolicy('10000000-0000-4000-8000-000000000099')).toBeUndefined();
});

it('기본 정책은 미설정이면 undefined 이고 설정되면 원문을 돌려준다', async () => {
  expect(await repo.defaultPolicy()).toBeUndefined();
  await client.query('INSERT INTO pg_matching_defaults VALUES ($1, $2)', ['default', JSON.stringify({ risk: 'gray', candidates: [] })]);
  expect(await repo.defaultPolicy()).toEqual({ risk: 'gray', candidates: [] });
});

it('PG 목록은 상태 불문 PG 만, 활성 후보 조회는 주어진 id 중 활성 PG 만 돌려준다', async () => {
  expect(await repo.pgDirectory()).toEqual([{ id: active, name: '활성 PG' }, { id: suspended, name: '정지 PG' }]);
  expect(await repo.activePgWorkspaces([active, suspended, buyer])).toEqual([{ id: active, name: '활성 PG' }]);
  expect(await repo.activePgWorkspaces([])).toEqual([]);
});
