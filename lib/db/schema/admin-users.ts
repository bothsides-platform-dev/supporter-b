import { bigint, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Operator-console (admin-supporter-b) account allowlist + TOTP second factor.
// Only the separate admin app reads/writes this table; bidit owns the DDL so
// `drizzle-kit push` keeps it. A row = an allowed Google email for the admin
// console. Rows are deleted (not soft-deleted) on removal; history lives in
// admin_audit_logs (entity_type='admin_user', entity_id=id).
//
// totp_secret_enc is AES-256-GCM ciphertext under a key that only the admin app
// holds (ADMIN_TOTP_ENCRYPTION_KEY), bound to this row's id — never plaintext.
// totp_enabled_at NULL = not enrolled yet (a pending secret may exist).
// totp_last_used_step blocks replay of an already-accepted code.
export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    totpSecretEnc: text('totp_secret_enc'),
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    totpLastUsedStep: bigint('totp_last_used_step', { mode: 'number' }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [check('admin_users_email_lower', sql`${t.email} = lower(${t.email})`)],
);
