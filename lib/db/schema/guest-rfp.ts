import {
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const guestRfpEvents = pgTable(
  'guest_rfp_events',
  {
    draftId: uuid('draft_id').notNull(),
    event: text('event').$type<'started' | 'completed'>().notNull(),
    result: text('result')
      .$type<'claimed' | 'sent' | 'failed' | 'skipped'>()
      .notNull()
      .default('claimed'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.draftId, t.event] }),
    check(
      'guest_rfp_events_event_check',
      sql`${t.event} IN ('started', 'completed')`,
    ),
    check(
      'guest_rfp_events_result_check',
      sql`${t.result} IN ('claimed', 'sent', 'failed', 'skipped')`,
    ),
  ],
);
