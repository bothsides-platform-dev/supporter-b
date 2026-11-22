import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './admin-users';
import { bids } from './bids';
import { outboxEntries } from './outbox-entries';
import { signingContracts } from './signing-contracts';
import { rfps } from './rfps';
import { rfpInvitations } from './rfp-invitations';
import { rfpPgReviews } from './pg-matching';
import { workspaces } from './workspaces';

export const adminFollowups = pgTable(
  'admin_followups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    rfpId: uuid('rfp_id').references(() => rfps.id, { onDelete: 'set null' }),
    invitationId: uuid('invitation_id').references(() => rfpInvitations.id, { onDelete: 'set null' }),
    reviewId: uuid('review_id').references(() => rfpPgReviews.id, { onDelete: 'set null' }),
    bidId: uuid('bid_id').references(() => bids.id, { onDelete: 'set null' }),
    deliveryId: uuid('delivery_id').references(() => outboxEntries.id, { onDelete: 'set null' }),
    signingId: uuid('signing_id').references(() => signingContracts.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    title: text('title').notNull(),
    ownerId: uuid('owner_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    channelUrl: text('channel_url'),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'admin_followups_target',
      sql`num_nonnulls(${t.invitationId}, ${t.reviewId}, ${t.bidId}, ${t.deliveryId}, ${t.signingId}) <= 1`,
    ),
    check('admin_followups_category', sql`${t.category} in ('contact','signing','delivery','terms')`),
    index('admin_followups_open_due_idx')
      .on(t.dueAt)
      .where(sql`${t.completedAt} is null`),
    index('admin_followups_rfp_idx').on(t.rfpId),
    index('admin_followups_workspace_idx').on(t.workspaceId),
  ],
);

export const adminFollowupUpdates = pgTable(
  'admin_followup_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => adminFollowups.id, { onDelete: 'cascade' }),
    actor: text('actor').notNull(),
    note: text('note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_followup_updates_task_idx').on(t.taskId, t.createdAt)],
);
