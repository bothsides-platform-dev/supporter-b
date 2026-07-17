import { pgTable, text, integer } from 'drizzle-orm/pg-core';

// rfp_counters 미러 — 전자계약서 번호(연월별 순번) 원자 발급용 카운터.
export const contractDocCounters = pgTable('contract_doc_counters', {
  yearMonth: text('year_month').primaryKey(),
  lastSeq: integer('last_seq').notNull().default(0),
});
