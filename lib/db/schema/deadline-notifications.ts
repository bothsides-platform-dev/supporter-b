import { integer, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { rfps } from './rfps';
import { users } from './users';
import { workspaces } from './workspaces';

export const deadlineNotificationDeliveries = pgTable('deadline_notification_deliveries', {
  key: text('key').primaryKey(),
  rfpId: uuid('rfp_id').notNull().references(() => rfps.id, { onDelete: 'cascade' }),
  recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  pgWsId: uuid('pg_ws_id').references(() => workspaces.id, { onDelete: 'set null' }),
  reviewId: uuid('review_id'),
  round: integer('round'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('deadline_notification_deliveries_rfp_idx').on(t.rfpId)]);
