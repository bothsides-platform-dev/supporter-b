/**
 * scripts/test-db-reset.ts — schema sync + reseed against $DATABASE_URL_TEST.
 *
 * Used by `e2e/global-setup.ts` (Playwright) before any spec runs, and
 * exposed as `pnpm e2e:reset` for manual local recovery between e2e
 * iterations.
 *
 * Behaviour
 *   - Forces `DATABASE_URL` to `DATABASE_URL_TEST` for this process so the
 *     transitively-imported `lib/db/client.ts` connects to 5433. NEVER
 *     touches the dev DB on 5432, even if the caller mis-set env.
 *   - Computes a SHA-256 hash of the migration file and compares it against
 *     the hash stored in `__e2e_schema_version`. Recreates the schema only
 *     when the hash differs (i.e. migration file changed). Otherwise skips
 *     straight to seed — keeping repeated runs fast.
 *   - Reuses `runSeed()` from `scripts/seed.ts` to populate test fixtures.
 *   - `supporter_b` is the DB superuser (POSTGRES_USER in docker-compose),
 *     so DROP SCHEMA is permitted.
 */
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

const TEST_DB_FALLBACK =
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const MIGRATION_FILE = join(
  process.cwd(),
  'drizzle/0000_hesitant_fantastic_four.sql',
);

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

  // ── Schema sync (only when migration file changed) ───────────────────────
  const migrationSql = readFileSync(MIGRATION_FILE, 'utf-8');
  const hash = createHash('sha256').update(migrationSql).digest('hex');

  const sql = postgres(testUrl);
  try {
    let storedHash: string | null = null;
    try {
      const rows =
        await sql`SELECT hash FROM __e2e_schema_version LIMIT 1`;
      storedHash = rows[0]?.hash ?? null;
    } catch {
      // Table doesn't exist yet — treat as stale.
    }

    if (storedHash !== hash) {
      console.log('[test-db-reset] migration changed — recreating schema…');
      await sql`DROP SCHEMA public CASCADE`;

      const statements = migrationSql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await sql.unsafe(statement);
      }

      // Store hash outside the Drizzle schema so it survives TRUNCATE.
      await sql`CREATE TABLE __e2e_schema_version (hash text NOT NULL)`;
      await sql`INSERT INTO __e2e_schema_version (hash) VALUES (${hash})`;
    } else {
      console.log('[test-db-reset] schema up to date — skipping recreation');
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
