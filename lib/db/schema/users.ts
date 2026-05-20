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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  // Auto-maintained by the `set_updated_at` trigger (see 0000 migration).
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
