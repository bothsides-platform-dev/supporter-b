import { pgTable, uuid, text, jsonb, timestamp, primaryKey, integer, doublePrecision, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { guestRfpDrafts } from './guest-rfp';
import type { AssistResult } from '@/lib/guest-rfp/suggestions';

export const guestQuoteCalls = pgTable('guest_quote_calls', {
  draftId: uuid('draft_id').notNull().references(() => guestRfpDrafts.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'business' | 'website'>().notNull(),
  inputHash: text('input_hash').notNull(),
  result: jsonb('result').$type<AssistResult>(),
  cost: doublePrecision('cost'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [
  primaryKey({ columns: [t.draftId, t.kind, t.inputHash] }),
  check('guest_quote_kind', sql`${t.kind} IN ('business','website')`),
  index('guest_quote_call_expiry').on(t.expiresAt),
]);
export const guestQuoteIpBudget = pgTable('guest_quote_ip_budget', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [index('guest_quote_ip_expiry').on(t.expiresAt)]);
