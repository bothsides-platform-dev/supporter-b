import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { attachments } from './attachments';
import { verificationStatusEnum } from './_enums';

export const pgProfiles = pgTable(
  'pg_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    bizNo: text('biz_no'),
    serviceScope: jsonb('service_scope').$type<{
      paymentMethods: string[];
      industries: string[];
      volumeRange: string;
      integrationTypes: string[];
    }>(),
    slaDays: integer('sla_days'),
    licenseDocId: uuid('license_doc_id').references(() => attachments.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('pg_profiles_workspace_idx').on(t.workspaceId)],
);

export const verificationApplications = pgTable(
  'verification_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    orgType: text('org_type').notNull(), // 'buyer' | 'pg'
    status: verificationStatusEnum('status').notNull().default('submitted'),
    reviewedBy: text('reviewed_by'),
    reason: text('reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(sql`now()`),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [index('verification_applications_workspace_idx').on(t.workspaceId)],
);

export const adminNotes = pgTable(
  'admin_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    body: text('body').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('admin_notes_entity_idx').on(t.entityType, t.entityId)],
);

export const riskFlags = pgTable(
  'risk_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    flagType: text('flag_type').notNull(),
    severity: text('severity').notNull(), // 'critical' | 'warning' | 'info'
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('risk_flags_entity_idx').on(t.entityType, t.entityId)],
);

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    payloadJson: jsonb('payload_json').$type<{
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      reason?: string;
    }>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('admin_audit_logs_entity_idx').on(t.entityType, t.entityId)],
);
