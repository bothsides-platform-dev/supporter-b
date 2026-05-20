import { pgTable, uuid, text, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { notificationChannelEnum, notificationStatusEnum } from './_enums';
import { users } from './users';
import { workspaces } from './workspaces';

// RANGE-partitioned by created_at (C5) at the physical level (see 0000
// migration: PARTITION BY RANGE + monthly children + DEFAULT). Drizzle treats
// it as a normal table for queries; Postgres routes inserts to partitions.
// PK must include the partition key → (id, created_at).
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').notNull().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    channel: notificationChannelEnum('channel').notNull(),
    status: notificationStatusEnum('status').notNull().default('queued'),
    linkUrl: text('link_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    index('notifications_user_created_idx').on(t.userId, sql`${t.createdAt} desc`),
  ],
);
