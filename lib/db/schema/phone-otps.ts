import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const phoneOtps = pgTable(
  'phone_otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('phone_otps_phone_created_at_idx').on(t.phone, t.createdAt),
  ],
);
