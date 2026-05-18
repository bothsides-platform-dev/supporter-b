import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { invitationStatusEnum } from './_enums';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { users } from './users';

export const rfpInvitations = pgTable(
  'rfp_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: text('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().default(sql`now()`),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
  },
  (t) => [
    // 같은 RFP에 같은 PG 워크스페이스를 두 번 추가하지 못하도록 차단.
    uniqueIndex('rfp_invitations_rfp_ws_uniq').on(t.rfpId, t.pgWsId),
  ],
);
