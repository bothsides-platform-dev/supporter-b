/**
 * scripts/test-db-reset.ts — TRUNCATE + reseed against $DATABASE_URL_TEST.
 *
 * Used by `e2e/global-setup.ts` (Playwright) before any spec runs, and
 * exposed as `pnpm e2e:reset` for manual local recovery between e2e
 * iterations.
 *
 * Behaviour
 *   - Forces `DATABASE_URL` to `DATABASE_URL_TEST` for this process so the
 *     transitively-imported `lib/db/client.ts` connects to 5433. NEVER
 *     touches the dev DB on 5432, even if the caller mis-set env.
 *   - Reuses `runSeed()` from `scripts/seed.ts`, which begins with a
 *     `TRUNCATE … CASCADE` of all 13 tables — so this is also the
 *     canonical "reset" path. No separate truncate step needed.
 *
 * Pre-conditions
 *   - `docker compose --profile test up -d pg-test` is running.
 *   - `pnpm db:migrate` (with DATABASE_URL=$DATABASE_URL_TEST) has been
 *     run at least once so the test DB has the schema.
 *
 * NOTE: We deliberately do NOT run migrations here — that's a one-time
 * setup performed by the operator (or CI), and re-running it on every
 * test boot doubles boot time. globalSetup calls migrate separately.
 */
import 'dotenv/config';

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEST_DB_FALLBACK =
  'postgres://bidit:bidit@localhost:5433/bidit_test';

// Must match `playwright.config.ts:webServer.env.UPLOAD_DIR`. test-db-reset
// is invoked by global-setup BEFORE the webServer starts, so we own the
// directory lifecycle here — wipe + recreate so stale uploads from prior
// runs can't satisfy assertions in fresh specs.
const E2E_UPLOAD_DIR = './uploads-e2e';

async function resetTestDatabase(): Promise<void> {
  const testUrl = process.env.DATABASE_URL_TEST ?? TEST_DB_FALLBACK;

  // Hard guard: never proceed against anything that smells like the dev
  // pool (5432) or a non-`_test` database name. The seed TRUNCATEs every
  // row, so a misconfigured run would silently nuke dev data.
  if (
    testUrl.includes(':5432/') ||
    !/[/?]bidit_test(\?|$)/.test(testUrl)
  ) {
    throw new Error(
      `[test-db-reset] refusing to reset non-test DB url: ${testUrl}\n` +
        `expected port 5433 and database name "bidit_test".`,
    );
  }

  // Force the seed module to pick up the test URL when it imports
  // `lib/db/client.ts`. Must happen before the dynamic import below.
  process.env.DATABASE_URL = testUrl;
  // Pin upload dir so seed's attachment write + the webServer's storage
  // reads point at the same place regardless of CI vs local.
  process.env.UPLOAD_DIR = E2E_UPLOAD_DIR;

  // Wipe + recreate the upload root so seed's attachment file is the only
  // artifact in there.
  const abs = path.resolve(process.cwd(), E2E_UPLOAD_DIR);
  await fsp.rm(abs, { recursive: true, force: true });
  await fsp.mkdir(abs, { recursive: true });

  const { runSeed } = await import('./seed');
  const { db } = await import('@/lib/db/client');

  const result = await runSeed(db, { withAttachment: true });
  console.log(
    `[test-db-reset] seeded ${result.rfps} rfps, ${result.invitations} invitations, ${result.bids} bids, ${result.attachments} attachments`,
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
