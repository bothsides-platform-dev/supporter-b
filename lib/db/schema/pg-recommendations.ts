import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';

// 운영자가 관리하는 업종별 추천 규칙. PG 프로필의 자기소개(service_scope)와 분리한다.
export const pgRecommendationGroups = pgTable('pg_recommendation_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const pgRecommendationMembers = pgTable(
  'pg_recommendation_members',
  {
    groupId: uuid('group_id').notNull().references(() => pgRecommendationGroups.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  (table) => [index('pg_recommendation_members_group_idx').on(table.groupId)],
);
