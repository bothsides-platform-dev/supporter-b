import { pgTable, text, integer } from 'drizzle-orm/pg-core';

export const rfpCounters = pgTable('rfp_counters', {
  yearMonth: text('year_month').primaryKey(),
  lastSeq: integer('last_seq').notNull().default(0),
});
