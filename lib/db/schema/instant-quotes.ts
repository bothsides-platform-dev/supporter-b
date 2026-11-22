import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { users } from './users';
import { pgRecommendationGroups } from './pg-recommendations';
import type {
  FixedTerms,
  InstantInput,
  InstantPolicy,
  Screening,
} from '@/lib/rfp/instant-quote';
import type { MerchantTier } from '@/lib/types/bid';

const time = (name: string) => timestamp(name, { withTimezone: true });
export const instantPgChannels = pgTable('instant_pg_channels', {
  pgId: uuid('pg_id')
    .primaryKey()
    .references(() => workspaces.id),
  recipient: text('recipient').notNull(),
  signupUrl: text('signup_url').notNull(),
  revision: integer('revision').notNull().default(1),
  enabled: boolean('enabled').notNull().default(false),
});
export const instantPolicies = pgTable(
  'instant_policies',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => pgRecommendationGroups.id, { onDelete: 'cascade' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => instantPgChannels.pgId),
    version: integer('version').notNull(),
    policy: jsonb('policy').$type<InstantPolicy>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.pgId] })],
);
export const instantRequests = pgTable(
  'instant_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestKey: uuid('request_key').notNull(),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => workspaces.id),
    creator: uuid('creator')
      .notNull()
      .references(() => users.id),
    input: jsonb('input').$type<InstantInput>().notNull(),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('instant_request_key').on(t.buyerId, t.requestKey)],
);
export const instantAttempts = pgTable(
  'instant_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => instantRequests.id),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => workspaces.id),
    code: text('code').unique().notNull(),
    stamp: text('stamp').notNull(),
    terms: jsonb('terms').$type<FixedTerms>().notNull(),
    screening: jsonb('screening').$type<Screening>().notNull(),
    applicant: jsonb('applicant')
      .$type<{ company: string; name: string; email: string; phone: string }>()
      .notNull(),
    consent: text('consent').notNull(),
    consentVersion: text('consent_version').notNull(),
    consentBy: uuid('consent_by')
      .notNull()
      .references(() => users.id),
    consentAt: time('consent_at').notNull(),
    validUntil: time('valid_until').notNull(),
    retryUntil: time('retry_until').notNull(),
    ackDue: time('ack_due').notNull(),
    applyDue: time('apply_due').notNull(),
    resultDue: time('result_due').notNull(),
    recipient: text('recipient').notNull(),
    channelRevision: integer('channel_revision').notNull(),
    signupUrl: text('signup_url').notNull(),
    visitedAt: time('visited_at'),
    ackAt: time('ack_at'),
    appliedAt: time('applied_at'),
    resultAt: time('result_at'),
    decision: text('decision').$type<'approved' | 'declined'>(),
    tier: text('tier').$type<MerchantTier>(),
    buyerAppliedAt: time('buyer_applied_at'),
    buyerEnrolledAt: time('buyer_enrolled_at'),
    closedAt: time('closed_at'),
    selectedAt: time('selected_at'),
    selectedBy: uuid('selected_by').references(() => users.id),
    checkedAt: time('checked_at'),
    differs: boolean('differs'),
    reported: text('reported'),
    resolution: text('resolution'),
    correctionRequestedAt: time('correction_requested_at'),
    correctionRequestedBy: uuid('correction_requested_by'),
    resolvedAt: time('resolved_at'),
    resolvedBy: uuid('resolved_by'),
  },
  (t) => [
    check(
      'instant_decision_tier',
      sql`(${t.decision} is null and ${t.tier} is null and ${t.resultAt} is null)
    or (${t.decision} is not null and ${t.resultAt} is not null and ${t.appliedAt} is not null and
      ((${t.decision}='declined' and ${t.tier} is null) or (${t.decision}='approved' and ${t.tier} is not null and ${t.tier} in ('sole','sme1','sme2','sme3','general'))))`,
    ),
    check(
      'instant_award_source',
      sql`(${t.selectedAt} is null and ${t.selectedBy} is null) or
    (${t.selectedAt} is not null and ${t.selectedBy} is not null and (${t.buyerEnrolledAt} is not null or ${t.decision} is not distinct from 'approved'))`,
    ),
    uniqueIndex('instant_active_attempt')
      .on(t.requestId)
      .where(sql`${t.closedAt} is null`),
    uniqueIndex('instant_request_pg').on(t.requestId, t.pgId),
    index('instant_pg_inbox').on(t.pgId),
    index('instant_followups')
      .on(t.ackDue, t.applyDue, t.resultDue)
      .where(sql`${t.closedAt} is null`),
  ],
);
export type InstantAttempt = typeof instantAttempts.$inferSelect;
export type InstantRequest = typeof instantRequests.$inferSelect;
