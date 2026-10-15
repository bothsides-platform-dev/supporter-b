import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { BusinessTemplate } from '@/lib/server/alimtalk/types';
import { users } from './users';
import { workspaces } from './workspaces';
export const alimtalkOutbox = pgTable(
  'alimtalk_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    template: text('template').$type<BusinessTemplate>().notNull(),
    rfpCode: text('rfp_code').notNull(),
    linkUrl: text('link_url').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    status: text('status')
      .$type<
        'pending' | 'sending' | 'accepted' | 'unknown' | 'failed' | 'skipped'
      >()
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    messageId: text('message_id'),
    lastError: text('last_error'),
  },
  (t) => [index('alimtalk_outbox_due_idx').on(t.status, t.scheduledAt)],
);
