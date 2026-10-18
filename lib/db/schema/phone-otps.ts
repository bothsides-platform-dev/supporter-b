import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { phoneOtpPurposeEnum } from './_enums';

export const phoneOtps = pgTable(
  'phone_otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    // Nullable only for pre-rollout rows. New issuance always supplies a purpose;
    // legacy rows fail closed because no protected operation matches NULL.
    purpose: phoneOtpPurposeEnum('purpose'),
    // Profile-update proofs are bound to the authenticated principal. Signup
    // proofs intentionally remain unbound because the principal does not exist yet.
    userId: uuid('user_id'),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    proofExpiresAt: timestamp('proof_expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('phone_otps_phone_created_at_idx').on(t.phone, t.createdAt),
  ],
);
