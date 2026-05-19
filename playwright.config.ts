/**
 * Playwright config — Step 14.
 *
 * Boots `pnpm dev` on port 3001 (not 3000 — keeps the e2e webServer from
 * stomping on a developer's local dev session) with DATABASE_URL pinned
 * to the test DB on 5433. globalSetup migrates + reseeds before any spec
 * runs.
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
        'postgres://bidit:bidit@localhost:5433/bidit_test',
      // Auth.js requires AUTH_SECRET ≥ 32 bytes. Deterministic for e2e.
      AUTH_SECRET: 'e2e-test-secret-' + 'a'.repeat(32),
      NEXT_PUBLIC_BASE_URL: 'http://localhost:3001',
      // Empty → Resend/NTS fall back to dev console / mock paths.
      // RESEND_API_KEY '': console fallback in lib/integrations/resend.ts.
      // NTS_SERVICE_KEY '': RealNtsClient throws NTS_NO_KEY — scenario A
      //   uses the seeded buyer workspace whose bizProfile is already
      //   captured, so /rfp/new never re-calls NTS. If a future spec
      //   needs lookup, inject MockNtsClient via __setNtsClientForTest.
      RESEND_API_KEY: '',
      NTS_SERVICE_KEY: '',
      // Pass the operator's Supabase env through to the webServer so its
      // `getStorage()` talks to the same bucket the spec helpers (running
      // in the Playwright process) wipe + populate in global-setup.
      SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      // Default Drizzle backend. Empty string preserves the default
      // (matches the spec's `REPO_BACKEND: ''` literal).
      REPO_BACKEND: '',
    },
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
