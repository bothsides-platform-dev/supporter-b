import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/** An absent row means no recorded signup consent, including legacy accounts. */
export const userSignupConsents = pgTable('user_signup_consents', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  termsAccepted: boolean('terms_accepted').notNull(),
  privacyAccepted: boolean('privacy_accepted').notNull(),
  marketingAccepted: boolean('marketing_accepted').notNull().default(false),
  termsVersion: text('terms_version').notNull(),
  termsUrl: text('terms_url').notNull(),
  privacyVersion: text('privacy_version').notNull(),
  privacyUrl: text('privacy_url').notNull(),
  marketingVersion: text('marketing_version').notNull(),
  marketingUrl: text('marketing_url').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  check('user_signup_consents_required', sql`${table.termsAccepted} = true AND ${table.privacyAccepted} = true`),
  check('user_signup_consents_documents_present', sql`
    btrim(${table.termsVersion}) <> '' AND btrim(${table.termsUrl}) <> '' AND
    btrim(${table.privacyVersion}) <> '' AND btrim(${table.privacyUrl}) <> '' AND
    btrim(${table.marketingVersion}) <> '' AND btrim(${table.marketingUrl}) <> ''
  `),
]);
