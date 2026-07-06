/**
 * Playwright config — Step 14.
 *
 * Boots `pnpm dev` on port 3001 (not 3000 — keeps the e2e webServer from
 * stomping on a developer's local dev session) with DATABASE_URL pinned
 * to the test DB on 5433 (supporter_b_test). globalSetup recreates the schema
 * (from lib/db/schema) + reseeds before any spec runs.
 *
 * Import note: the project pulls in the `playwright` package directly.
 * The conventional `@playwright/test` import path is just a re-export
 * surface — `playwright/test` is the same module and avoids adding a
 * second package to the lock file (Step 14 hard constraint: "새 라이브러리
 * 추가 금지").
 *
 * Pre-reqs (operator):
 *   docker compose --profile test up -d pg-test
 *   pnpm dlx playwright install --with-deps chromium    # one-time
 *
 * Then:
 *   pnpm e2e
 */
import { defineConfig, devices } from 'playwright/test';

// `getStorage()` (lib/server/storage/index.ts) is R2-or-throw in every
// environment — there is no dev/test fallback backend. Attachment bytes
// therefore require real R2 config (R2_* env). Specs that need bytes to
// cross process boundaries (the Playwright process calling
// `getStorage().save()` directly, and the `pnpm dev` webServer under
// test reading them back) self-skip when that env is absent — see
// e2e/bid-detail-pdf-preview.spec.ts. When R2 env is present, both
// processes read `process.env.R2_*` and therefore talk to the same
// bucket, so no extra wiring is needed here beyond the passthrough below.

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  // Scenarios A/B/C share the seeded buyer (yeonseong.dev@gmail.com) and
  // the seeded RFP P-2604-0001 — running them in parallel workers races
  // on row state (B rotates toss invitation; C resets RFP to 'sent').
  // One worker keeps the §6 chain deterministic. fullyParallel:false also
  // serialises projects (we only have chromium today, but defensive).
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test',
      // Auth.js requires AUTH_SECRET ≥ 32 bytes. Deterministic for e2e.
      // Use AUTH_SECRET_E2E if set; otherwise fall back to process env (which
      // Next.js fills from .env). Using a dedicated test secret avoids using
      // the production secret in tests while staying consistent between
      // loginAction (node) and proxy.ts (edge) within the same server.
      AUTH_SECRET: process.env.AUTH_SECRET_E2E ?? process.env.AUTH_SECRET ?? ('e2e-test-secret-' + 'a'.repeat(32)),
      AUTH_URL: 'http://localhost:3001',
      // AUTH_COOKIE_DOMAIN must be unset so the session cookie is host-only
      // (no domain attribute). In local dev the .env may set this to a wildcard
      // like `.lvh.me` for cross-subdomain testing, which causes the cookie to
      // be excluded from localhost requests and breaks e2e auth.
      AUTH_COOKIE_DOMAIN: '',
      NEXT_PUBLIC_BASE_URL: 'http://localhost:3001',
      NEXT_PUBLIC_BUYER_ORIGIN: 'http://localhost:3001',
      NEXT_PUBLIC_PARTNER_ORIGIN: 'http://localhost:3001',
      // Empty → Resend/NTS fall back to dev console / mock paths.
      // RESEND_API_KEY '': console fallback in lib/integrations/resend.ts.
      // NTS_SERVICE_KEY '': RealNtsClient throws NTS_NO_KEY — scenario A
      //   uses the seeded buyer workspace whose bizProfile is already
      //   captured, so /rfp/new never re-calls NTS. If a future spec
      //   needs lookup, inject MockNtsClient via __setNtsClientForTest.
      RESEND_API_KEY: '',
      NTS_SERVICE_KEY: '',
      // `getStorage()` requires real R2 config in every environment (see
      // module-scope note above). Pass the four R2_* vars through so the
      // webServer process talks to the same bucket as the Playwright
      // process. Left empty when unset — specs needing attachment bytes
      // self-skip in that case rather than the server failing to boot
      // (only routes that actually call `getStorage()` would throw).
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? '',
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? '',
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
      R2_BUCKET: process.env.R2_BUCKET ?? '',
      // Isolate this dev server's build dir + lock so it can boot alongside a
      // developer's local `pnpm dev` on :3000. Next 16's `<distDir>/dev/lock`
      // is per-distDir (not per-port) — sharing `.next` makes the second
      // `next dev` exit(1) with "Another next dev server is already running".
      // See next.config.ts (distDir reads NEXT_DIST_DIR).
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
