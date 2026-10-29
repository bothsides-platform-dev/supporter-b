import { jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';
import { verificationApplications } from './admin';
import { rfps } from './rfps';
import { attachments } from './attachments';
import type { GuestAnswers } from '@/lib/guest-rfp/answers';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const guestRfpEvents = pgTable(
  'guest_rfp_events',
  {
    draftId: uuid('draft_id').notNull(),
    event: text('event').$type<'started' | 'completed'>().notNull(),
    result: text('result')
      .$type<'claimed' | 'sent' | 'failed' | 'skipped'>()
      .notNull()
      .default('claimed'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.draftId, t.event] }),
    check(
      'guest_rfp_events_event_check',
      sql`${t.event} IN ('started', 'completed')`,
    ),
    check(
      'guest_rfp_events_result_check',
      sql`${t.result} IN ('claimed', 'sent', 'failed', 'skipped')`,
    ),
  ],
);

export const guestRfpDrafts = pgTable('guest_rfp_drafts', {
  id: uuid('id').primaryKey(),
  secretHash: text('secret_hash').notNull(),
  answers: jsonb('answers').$type<{ version: 1; data: GuestAnswers; quoteContext?: import('@/lib/guest-rfp/quote-context').QuoteContext }>().notNull(),
  revision: integer('revision').notNull().default(1),
  memberAttachmentIds: jsonb('member_attachment_ids').$type<string[]>().notNull().default([]),
  fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
  userId: uuid('user_id').references(() => users.id),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  applicationId: uuid('application_id').references(() => verificationApplications.id),
  requestKey: uuid('request_key').notNull().defaultRandom(),
  completedRfpId: uuid('completed_rfp_id').references(() => rfps.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  autoResumeConsumedAt: timestamp('auto_resume_consumed_at', { withTimezone: true }),
  resumeConsumedAt: timestamp('resume_consumed_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, t => [
  check('guest_draft_owner_check', sql`((${t.userId} IS NULL AND ${t.workspaceId} IS NULL AND ${t.applicationId} IS NULL) OR (${t.userId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL))`),
  check('guest_draft_revision_check', sql`${t.revision} > 0`),
  index('guest_draft_owner_idx').on(t.userId, t.workspaceId),
  index('guest_draft_expiry_idx').on(t.expiresAt),
]);
export const guestRfpFiles = pgTable('guest_rfp_files', {
  id: uuid('id').primaryKey(),
  draftId: uuid('draft_id').notNull().references(() => guestRfpDrafts.id),
  clientId: uuid('client_id').notNull(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  status: text('status').$type<'pending' | 'ready' | 'deleting'>().notNull().default('pending'),
  attachmentId: uuid('attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('guest_file_client_idx').on(t.draftId, t.clientId).where(sql`${t.status} <> 'deleting'`),
  check('guest_file_status_check', sql`${t.status} IN ('pending','ready','deleting')`),
  check('guest_file_size_check', sql`${t.size} BETWEEN 1 AND 20971520`),
]);

export const guestRfpRequests = pgTable('guest_rfp_requests', {
  draftId: uuid('draft_id').primaryKey().references(() => guestRfpDrafts.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  pgId: uuid('pg_id').notNull().references(() => workspaces.id),
  days: integer('days').notNull(),
  status: text('status').$type<'unbound' | 'waiting' | 'submitted' | 'needs_action' | 'canceled' | 'expired'>().notNull(),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  error: text('error'),
  rfpCode: text('rfp_code'),
  pgName: text('pg_name').notNull(),
  deadline: timestamp('deadline', { withTimezone: true }),
  effectSeenAt: timestamp('effect_seen_at', { withTimezone: true }),
}, t => [
  check('guest_request_days_check', sql`${t.days} IN (3,5,10)`),
  check('guest_request_status_check', sql`${t.status} IN ('unbound','waiting','submitted','needs_action','canceled','expired')`),
  index('guest_request_waiting_idx').on(t.status, t.expiresAt),
]);
