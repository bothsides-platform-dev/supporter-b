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
    // Nullable = user-level notification (워크스페이스에 묶이지 않음). 예: 워크스페이스
    // 초대 알림은 받는 사람이 아직 그 워크스페이스 멤버가 아니라 특정 ws에 귀속될
    // 수 없다 → null 로 두면 읽기 계층(findRecentForUser)이 어느 ws를 보든 노출한다.
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
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
