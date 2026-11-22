import { config as dotenvConfig } from 'dotenv';
import type { Config } from 'drizzle-kit';

dotenvConfig({ path: '.env.production', override: false });
dotenvConfig({ override: false });

export default {
  // push-only: `drizzle-kit push` diffs this schema straight against the live
  // DB. No `out`/migrations folder — the project moved off `drizzle-kit migrate`.
  // Point at the barrel, not the directory: drizzle-kit loads every file in a
  // directory and does not dedupe re-exported views, so push exits 1.
  schema: './lib/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: 'snake_case',
  // Without these, push runs non-data-loss DDL (DROP CONSTRAINT, DROP TYPE) with
  // no plan or prompt. `--force` still skips the prompt for disposable CI DBs.
  strict: true,
  verbose: true,
} satisfies Config;
