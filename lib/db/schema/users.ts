import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  avatarColor: text('avatar_color').notNull().default('#000'),
  status: text('status').notNull().default('active'),
  // Remembered active workspace — restored on login so a multi-workspace user
  // lands where they left off. Nullable; set on first ws creation (signup /
  // createWorkspace) and on every switchWorkspaceAction. The FK (ON DELETE SET
  // NULL → workspaces.id) is declared in 0001_multi_workspace.sql, NOT via
  // .references() here — importing `workspaces` would form a users→workspaces→
  // biz_profiles→users type cycle (TS7022). Migrations are hand-written, so the
  // Drizzle-level .references() is unnecessary.
  lastActiveWorkspaceId: uuid('last_active_workspace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  // Auto-maintained by the `set_updated_at` trigger (see 0000 migration).
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
