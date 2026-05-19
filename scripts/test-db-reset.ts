/**
 * scripts/test-db-reset.ts — TRUNCATE + reseed against $DATABASE_URL_TEST,
 * and wipe the Supabase Storage `attachments` bucket so stale uploads from
 * prior runs can't satisfy fresh-spec assertions.
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
 *   - Empties the Supabase `attachments` bucket via recursive list + remove,
 *     replacing the old fs `./uploads-e2e` rm/mkdir.
 *
 * Pre-conditions
 *   - `docker compose --profile test up -d pg-test` is running.
 *   - `supabase start` is running (local Storage) OR `SUPABASE_URL` /
 *     `SUPABASE_SERVICE_ROLE_KEY` point at a dedicated test project.
 *   - `pnpm db:migrate` (with DATABASE_URL=$DATABASE_URL_TEST) has been
 *     run at least once so the test DB has the schema.
 *
 * NOTE: We deliberately do NOT run migrations here — that's a one-time
 * setup performed by the operator (or CI), and re-running it on every
 * test boot doubles boot time. globalSetup calls migrate separately.
 */
import 'dotenv/config';

import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TEST_DB_FALLBACK =
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

const BUCKET = 'attachments';

/**
 * Recursively walk the `attachments` bucket and remove every object.
 * Exported for unit testing — the real call path is from
 * `resetTestDatabase()` which constructs the client from env.
 *
 * The storage scheme is `{yyyy}/{mm}/{uuid}.{ext}` (see
 * `lib/server/storage/path.ts`) so the recursion only ever needs to
 * descend two levels in practice, but the implementation is generic
 * over arbitrary nesting.
 */
export async function truncateAttachmentsBucket(
  sb: SupabaseClient,
): Promise<void> {
  const bucket = sb.storage.from(BUCKET);

  const fileKeys: string[] = [];
  async function walk(prefix: string): Promise<void> {
    const { data, error } = await bucket.list(prefix);
    if (error) throw error;
    if (!data) return;
    for (const entry of data) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Supabase reports folders with `id: null`; files carry a uuid id.
      if (entry.id === null) {
        await walk(key);
      } else {
        fileKeys.push(key);
      }
    }
  }
  await walk('');

  if (fileKeys.length === 0) return;
  const { error } = await bucket.remove(fileKeys);
  if (error) throw error;
}

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

  // Empty the Supabase Storage bucket. We build a client here (not via
  // `getStorage()`) so this script has an explicit, mockable surface
  // and so a missing env var fails loud at the entry point rather than
  // deep in `resetTestDatabase` -> seed.
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[test-db-reset] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);
  await truncateAttachmentsBucket(sb);

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
