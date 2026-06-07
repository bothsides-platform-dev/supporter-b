import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Server-side brute-force / password-spraying guard. One row per rate-limit
// key — either `email:<addr>` or `ip:<addr>` — tracking consecutive failed
// logins and, once the threshold is hit, a lock window. Replaces the
// client-only localStorage tracker (lib/auth/login-attempts.ts), which an
// attacker hitting the server action directly could trivially bypass.
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
