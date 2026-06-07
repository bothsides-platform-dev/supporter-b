import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { verificationPurposeEnum } from './_enums';

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purpose: verificationPurposeEnum('purpose').notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    // Failed 6-digit-code attempts against this token. Caps brute-force of the
    // emailCode hash (phone OTP has the same guard). The link path consumes by
    // tokenHash and never touches this.
    attempts: integer('attempts').notNull().default(0),
    meta: jsonb('meta').default(sql`'{}'::jsonb`),
  },
  (t) => [
    index('verification_email_purpose_idx').on(t.email, t.purpose),
  ],
);
