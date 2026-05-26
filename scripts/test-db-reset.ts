/**
 * scripts/test-db-reset.ts — schema recreation + reseed against $DATABASE_URL_TEST.
 *
 * Used by `e2e/global-setup.ts` (Playwright) before any spec runs, and
 * exposed as `pnpm e2e:reset` for manual local recovery between e2e
 * iterations.
 *
 * Behaviour
 *   - Forces `DATABASE_URL` to `DATABASE_URL_TEST` for this process so the
 *     transitively-imported `lib/db/client.ts` connects to 5433. NEVER
 *     touches the dev DB on 5432, even if the caller mis-set env.
 *   - DROP SCHEMA public CASCADE → re-applies drizzle/0000_*.sql from
 *     scratch so the test DB always matches the current Drizzle schema.
 *     No manual "push" step required after schema changes.
 *   - Reuses `runSeed()` from `scripts/seed.ts` to populate test fixtures.
 *   - Attachment bytes live in the `attachment_blobs` table (Postgres
 *     backend) — recreated with the schema, no external object store to wipe.
 *
 * Pre-conditions
 *   - `docker compose --profile test up -d pg-test` is running.
 *   - `supporter_b` is the DB superuser (POSTGRES_USER in docker-compose),
 *     so DROP SCHEMA is permitted.
 */
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

const TEST_DB_FALLBACK =
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

async function resetTestDatabase(): Promise<void> {
  const testUrl = process.env.DATABASE_URL_TEST ?? TEST_DB_FALLBACK;

  // Hard guard: never proceed against anything that smells like the dev
  // pool (5432) or a non-`_test` database name.
  if (
    testUrl.includes(':5432/') ||
    !/[/?]supporter_b_test(\?|$)/.test(testUrl)
  ) {
    throw new Error(
      `[test-db-reset] refusing to reset non-test DB url: ${testUrl}\n` +
        `expected port 5433 and database name "supporter_b_test".`,
    );
  }

  // Force the seed module to pick up the test URL when it imports
  // `lib/db/client.ts`. Must happen before the dynamic import below.
  process.env.DATABASE_URL = testUrl;

  // ── Schema recreation ────────────────────────────────────────────────────
  // Wipe and rebuild from the single canonical migration file so the test DB
  // always matches the current Drizzle schema, even after column additions.
  const sql = postgres(testUrl);
  try {
    await sql`DROP SCHEMA public CASCADE`;

    const migrationFile = join(process.cwd(), 'drizzle/0000_hesitant_fantastic_four.sql');
    const migrationSql = readFileSync(migrationFile, 'utf-8');
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await sql.unsafe(statement);
    }
  } finally {
    await sql.end();
  }

  // ── Seed ─────────────────────────────────────────────────────────────────
  const { runSeed } = await import('./seed');
  const { db } = await import('@/lib/db/client');

  const result = await runSeed(db);
  console.log(
    `[test-db-reset] seeded ${result.rfps} rfps, ${result.invitations} invitations, ${result.bids} bids`,
  );
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  resetTestDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[test-db-reset] failed:', err);
      process.exit(1);
    });
}

export { resetTestDatabase };
