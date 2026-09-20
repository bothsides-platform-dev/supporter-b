import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pgRecommendationGroups } from './pg-recommendations';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import type { MatchingPolicy, MatchingCandidate } from '@/lib/rfp/pg-matching';

// Ordered per-industry candidates support a PG serving multiple industries.
export const pgMatchingPolicies = pgTable('pg_matching_policies', {
  groupId: uuid('group_id').primaryKey().references(() => pgRecommendationGroups.id, { onDelete: 'cascade' }),
  policy: jsonb('policy').$type<MatchingPolicy>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rfpMatchingRequests = pgTable('rfp_matching_requests', {
  rfpId: uuid('rfp_id').primaryKey().references(() => rfps.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => pgRecommendationGroups.id, { onDelete: 'set null' }),
  industryName: text('industry_name').notNull(),
  risk: text('risk').notNull(),
  buyerWsId: uuid('buyer_ws_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  requestKey: uuid('request_key').notNull(),
}, t => [uniqueIndex('rfp_matching_request_key').on(t.buyerWsId, t.requestKey)]);

export const rfpPgReviews = pgTable('rfp_pg_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfpId: uuid('rfp_id').notNull().references(() => rfpMatchingRequests.rfpId, { onDelete: 'cascade' }),
  pgWorkspaceId: uuid('pg_ws_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['requested', 'reviewing', 'quoted', 'rejected', 'withdrawn'] }).notNull().default('requested'),
  reason: text('reason').notNull().default(''),
  candidate: jsonb('candidate').$type<MatchingCandidate & { name: string }>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('rfp_pg_review_pair').on(t.rfpId, t.pgWorkspaceId),
  uniqueIndex('rfp_pg_review_active').on(t.rfpId).where(sql`${t.status} IN ('requested', 'reviewing', 'quoted')`),
  index('rfp_pg_review_pg').on(t.pgWorkspaceId),
  check('rfp_pg_review_status', sql`${t.status} IN ('requested', 'reviewing', 'quoted', 'rejected', 'withdrawn')`),
]);
