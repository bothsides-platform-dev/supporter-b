import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { DrizzleWorkspaceRepository } from '../workspace';
import * as schema from '@/lib/db/schema';

describe('PG 추천 업종 조회', () => {
  it('업종을 정렬하고 승인된 PG만 포함하며 테스트 PG 숨김을 지킨다', async () => {
    const client = new PGlite();
    await client.exec(`
      CREATE TABLE workspaces (id uuid PRIMARY KEY, type text NOT NULL, name text NOT NULL, status text NOT NULL);
      CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY, name text NOT NULL, sort_order integer NOT NULL);
      CREATE TABLE pg_recommendation_members (pg_ws_id uuid PRIMARY KEY, group_id uuid NOT NULL);
      INSERT INTO pg_recommendation_groups VALUES
        ('10000000-0000-4000-8000-000000000001', '여행', 2),
        ('10000000-0000-4000-8000-000000000002', '쇼핑', 1);
      INSERT INTO workspaces VALUES
        ('20000000-0000-4000-8000-000000000001', 'pg', 'Alpha PG', 'active'),
        ('20000000-0000-4000-8000-000000000002', 'pg', '테스트 PG', 'active'),
        ('20000000-0000-4000-8000-000000000003', 'pg', 'Pending PG', 'pending');
      INSERT INTO pg_recommendation_members VALUES
        ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
        ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002'),
        ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001');
    `);
    const repo = new DrizzleWorkspaceRepository(drizzle(client, { schema }));

    expect(await repo.listPgRecommendationGroups()).toEqual([
      { id: '10000000-0000-4000-8000-000000000002', name: '쇼핑', pgWorkspaceIds: ['20000000-0000-4000-8000-000000000001'] },
      { id: '10000000-0000-4000-8000-000000000001', name: '여행', pgWorkspaceIds: [] },
    ]);
    expect((await repo.listPgRecommendationGroups({ includeTest: true }))[0].pgWorkspaceIds).toEqual([
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
    ]);
  });
});
