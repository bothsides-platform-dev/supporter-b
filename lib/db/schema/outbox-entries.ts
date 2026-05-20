import { pgTable, uuid, text, timestamp, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { outboxEventEnum, outboxStatusEnum } from './_enums';

export const outboxEntries = pgTable(
  'outbox_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    event: outboxEventEnum('event').notNull(),
    toAddr: text('to_addr').notNull(),
    subject: text('subject').notNull(),
    html: text('html').notNull(),
    dedupeKey: text('dedupe_key'),
    status: outboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (t) => [
    // Partial unique on dedupe_key (NULL allowed for events without a dedupe identity).
    uniqueIndex('outbox_dedupe_key_unique')
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} IS NOT NULL`),
    // C6: flush hot path — claims pending rows ordered by scheduled_at. Partial
    // index stays small even as sent rows accumulate.
    index('outbox_pending_idx')
      .on(t.scheduledAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);
