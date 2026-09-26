import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Operations-only ledger; keep it in the schema so db:push preserves import history.
export const appDataMigrations = pgTable('app_data_migrations', {
  id: text('id').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
