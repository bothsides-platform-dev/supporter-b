import { bigint, boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { adminUsers } from './admin-users';

// Operator-console (admin-supporter-b) passkeys: WebAuthn credentials an admin
// may register as an ADDITIONAL second factor next to TOTP (TOTP stays the
// base enrollment). Only the separate admin app reads/writes this table; bidit
// owns the DDL so `drizzle-kit push` keeps it. Rows go away with their admin
// (ON DELETE CASCADE) and on a 2FA reset; history lives in admin_audit_logs
// (entity_type='admin_user').
//
// credential_id / public_key are base64url (the COSE public key is not a
// secret). sign_count is the authenticator's uint32 signature counter (0 for
// most synced passkeys). aaguid names the authenticator model/provider — a UX
// hint only, never an access decision (it is not attested for platform
// passkeys). last_used_at doubles as the replay guard: an assertion is accepted
// only for a challenge issued after it.
export const adminPasskeys = pgTable(
  'admin_passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    signCount: bigint('sign_count', { mode: 'number' }).notNull().default(0),
    transports: text('transports').array(),
    backupEligible: boolean('backup_eligible').notNull(),
    backedUp: boolean('backed_up').notNull(),
    aaguid: text('aaguid').notNull(),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('admin_passkeys_admin_user_idx').on(t.adminUserId)],
);
