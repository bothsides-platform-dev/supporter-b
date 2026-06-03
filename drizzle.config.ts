import { config as dotenvConfig } from 'dotenv';
import type { Config } from 'drizzle-kit';

dotenvConfig({ path: '.env.production', override: false });
dotenvConfig({ override: false });

export default {
  // push-only: `drizzle-kit push` diffs this schema straight against the live
  // DB. No `out`/migrations folder — the project moved off `drizzle-kit migrate`.
  schema: './lib/db/schema',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: 'snake_case',
} satisfies Config;
