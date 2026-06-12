import { pgTable, uuid, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  avatarColor: text('avatar_color').notNull().default('#000'),
  status: text('status').notNull().default('active'),
  // Email-verification flag. New signups are created false and flipped true when
  // the user consumes a signup_email token (link or 6-digit code). Read by the
  // /pending-approval verify UI and the (separate-repo) admin console, which
  // only approves verified users. NOT in the JWT/session — read from DB.
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // Server-side JWT revocation counter. Stamped into the token as the `sv`
  // claim at login; bumped on password reset / email change / account deletion
  // so previously issued tokens go stale (see lib/auth/session-version.ts).
  sessionVersion: integer('session_version').notNull().default(1),
  // Remembered active workspace — restored on login so a multi-workspace user
  // lands where they left off. Nullable; set on first ws creation (signup /
  // createWorkspace) and on every switchWorkspaceAction. The FK (ON DELETE SET
  // NULL → workspaces.id) is declared in 0001_multi_workspace.sql, NOT via
  // .references() here — importing `workspaces` would form a users→workspaces→
  // biz_profiles→users type cycle (TS7022). Migrations are hand-written, so the
  // Drizzle-level .references() is unnecessary.
  lastActiveWorkspaceId: uuid('last_active_workspace_id'),
  // System-managed master accounts (pre-seeded PG company admins).
  // Hidden from all member-list UIs; never shown to end users.
  isSystemAccount: boolean('is_system_account').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // Auto-maintained by the `set_updated_at` trigger (see 0000 migration).
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
