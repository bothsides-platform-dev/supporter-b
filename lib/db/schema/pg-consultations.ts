import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgView,
  uuid,
  timestamp,
  integer,
  text,
  jsonb,
  boolean,
  index,
  primaryKey,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { users } from './users';
import { rfpPgReviews } from './pg-matching';
import { chatMessages } from './chat-messages';

const instant = (name: string) => timestamp(name, { withTimezone: true });
export type AssignmentRule = { userId: string; groupId: string | null; size: '50m' | '100m' | null };

export const pgAssignmentPolicies = pgTable(
  'pg_assignment_policies',
  {
    pgId: uuid('pg_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    alimtalkReady: boolean('alimtalk_ready').notNull().default(false),
    contactDays: integer('contact_days').notNull(),
    windowDays: integer('window_days').notNull(),
    threshold: integer('threshold').notNull(),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => users.id),
    roster: jsonb('roster').$type<AssignmentRule[]>().notNull().default([]),
  },
  (t) => [
    check(
      'pg_assignment_positive_terms',
      sql`${t.contactDays} BETWEEN 1 AND 30 AND ${t.windowDays} > 0 AND ${t.threshold} > 0`,
    ),
  ],
);

export const consultationCases = pgTable(
  'pg_consultation_cases',
  {
    reviewId: uuid('review_id')
      .primaryKey()
      .references(() => rfpPgReviews.id, { onDelete: 'cascade' }),
    assignee: uuid('assignee').references(() => users.id),
    revision: integer('revision').notNull().default(1),
    notifiedRevision: integer('notified_revision').notNull().default(0),
    consentBy: uuid('consent_by')
      .notNull()
      .references(() => users.id),
    consentVersion: text('consent_version').notNull(),
    consentText: text('consent_text').notNull(),
    consentAt: instant('consent_at').notNull(),
    contactDue: instant('contact_due').notNull(),
    quoteDue: instant('quote_due').notNull(),
    lateQuoteDue: instant('late_quote_due'),
    quotedAt: instant('quoted_at'),
  },
  (t) => [index('pg_consultation_contact_due').on(t.contactDue)],
);

export const consultationQuestions = pgTable(
  'pg_consultation_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => consultationCases.reviewId, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    reportedBy: uuid('reported_by')
      .notNull()
      .references(() => users.id),
    recipient: uuid('recipient')
      .notNull()
      .references(() => users.id),
    messageId: uuid('message_id')
      .unique()
      .references(() => chatMessages.id, { onDelete: 'set null' }),
    reportedAt: instant('reported_at').notNull(),
    remindAt: instant('remind_at').notNull(),
    expiresAt: instant('expires_at').notNull(),
    answer: text('answer').$type<'received' | 'missed'>(),
    answeredAt: instant('answered_at'),
    channel: text('channel').$type<'app' | 'email'>(),
    judgment: text('judgment').$type<'accepted' | 'absent'>(),
    judgedBy: text('judged_by'),
    reason: text('reason'),
    judgedAt: instant('judged_at'),
  },
  (t) => [index('pg_consultation_questions_review').on(t.reviewId, t.reportedAt)],
);

export const consultationEvidence = pgTable(
  'pg_consultation_evidence',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => consultationQuestions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    observedAt: instant('observed_at').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.key] })],
);

export const consultationEvents = pgTable(
  'pg_consultation_events',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => consultationCases.reviewId, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    at: instant('at').notNull().defaultNow(),
    detail: text('detail').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.key] })],
);

export const consultationCorrections = pgTable(
  'pg_consultation_corrections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => workspaces.id),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => users.id),
    caseIds: uuid('case_ids').array().notNull(),
    body: text('body').notNull(),
    confirmedBy: text('confirmed_by').notNull(),
    confirmedAt: instant('confirmed_at').notNull().defaultNow(),
    fingerprint: text('fingerprint').notNull(),
  },
  (t) => [uniqueIndex('pg_correction_snapshot').on(t.pgId, t.fingerprint)],
);

// Both applications read the same projection. An extension after the deadline retains
// the missed deadline. A rejected or otherwise closed review stops accruing delays.
export const consultationProgress = pgView('pg_consultation_progress', {
  reviewId: uuid('review_id').notNull(),
  firstContactAt: instant('first_contact_at'),
  missed: boolean('missed').notNull(),
  disputed: boolean('disputed').notNull(),
  contactLate: boolean('contact_late').notNull(),
  quoteLate: boolean('quote_late').notNull(),
  canSwitch: boolean('can_switch').notNull(),
}).as(sql`
  WITH facts AS (
    SELECT q.review_id, q.reported_at AS at, 'claim' AS kind,
      q.answer IS DISTINCT FROM 'missed' OR q.judgment = 'accepted' AS valid
    FROM pg_consultation_questions q
    UNION ALL
    SELECT q.review_id, q.answered_at, q.answer, q.answer = 'received'
    FROM pg_consultation_questions q WHERE q.answer IS NOT NULL
    UNION ALL
    SELECT q.review_id, e.observed_at, 'observed',
      q.answer IS DISTINCT FROM 'missed' OR q.judgment = 'accepted' OR e.observed_at > q.answered_at
    FROM pg_consultation_evidence e JOIN pg_consultation_questions q ON q.id = e.question_id
  ), evidence AS (
    SELECT review_id, min(at) FILTER (WHERE valid) AS first_at,
      (array_agg(kind ORDER BY at DESC, CASE kind WHEN 'missed' THEN 0 WHEN 'received' THEN 1 ELSE 2 END))[1] AS latest
    FROM facts GROUP BY review_id
  ), cases AS (
    SELECT c.*, e.first_at, COALESCE(e.latest = 'missed', false) AS missed,
      EXISTS (SELECT 1 FROM pg_consultation_questions q WHERE q.review_id = c.review_id AND q.answer = 'missed' AND q.judgment IS NULL) AS disputed,
      r.status IN ('requested','reviewing') AND f.status = 'sent' AS open,
      LEAST(now(), CASE WHEN r.status IN ('rejected','withdrawn','buyer_ended') THEN r.updated_at END,
        CASE WHEN f.status <> 'sent' THEN f.updated_at END) AS until
    FROM pg_consultation_cases c JOIN rfp_pg_reviews r ON r.id=c.review_id
    JOIN rfps f ON f.id=r.rfp_id LEFT JOIN evidence e ON e.review_id=c.review_id
  )
  SELECT review_id, first_at AS first_contact_at, missed, disputed,
    NOT disputed AND (first_at > contact_due OR (first_at IS NULL AND until >= contact_due)) IS TRUE AS contact_late,
    late_quote_due IS NOT NULL OR (quoted_at > quote_due OR (quoted_at IS NULL AND until >= quote_due)) IS TRUE AS quote_late,
    open AND quoted_at IS NULL AND now() >= contact_due AND (first_at IS NULL OR missed) AS can_switch
  FROM cases
`);
