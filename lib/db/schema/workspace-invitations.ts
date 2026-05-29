import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { memberRoleEnum, workspaceInvitationStatusEnum } from './_enums';
import { workspaces } from './workspaces';
import { users } from './users';

export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    invitedEmail: text('invited_email').notNull(),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id),
    role: memberRoleEnum('role').notNull().default('member'),
    tokenHash: text('token_hash').notNull().unique(),
    status: workspaceInvitationStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('workspace_invitations_ws_email_pending_uidx')
      .on(t.workspaceId, sql`lower(${t.invitedEmail})`)
      .where(sql`${t.status} = 'pending'`),
  ],
);
