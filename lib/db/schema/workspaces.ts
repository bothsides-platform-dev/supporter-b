import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaceTypeEnum, workspaceStatusEnum } from './_enums';
import { bizProfiles } from './biz-profiles';

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: workspaceTypeEnum('type').notNull(),
    name: text('name').notNull(),
    bizProfileId: uuid('biz_profile_id').references(() => bizProfiles.id, {
      onDelete: 'set null',
    }),
    status: workspaceStatusEnum('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    hasLogo: boolean('has_logo').notNull().default(false),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('workspaces_biz_profile_idx').on(t.bizProfileId)],
);
