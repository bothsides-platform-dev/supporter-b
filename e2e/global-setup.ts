/**
 * Playwright globalSetup — runs once before any spec.
 *
 * Responsibilities:
 *   1. Pin DATABASE_URL to DATABASE_URL_TEST (5433/supporter_b_test) so the dev
 *      Next server, started by `webServer` in playwright.config.ts, talks
 *      to the test DB and not to 5432.
 *   2. TRUNCATE+reseed via `scripts/test-db-reset.ts:resetTestDatabase`.
 *
 * Schema 적용(db:migrate)은 더 이상 수행하지 않는다 — 테스트 DB에 스키마가
 * 이미 존재해야 한다(운영자/별도 절차 책임).
 *
 * NOTE: `globalSetup` runs once per `playwright test` invocation. Each
 * spec is responsible for handling its own state if it needs strict
 * isolation across specs. The 3 §6 scenarios are written so each one
 * can run independently against a freshly-seeded DB (Step 14 spec).
 *
 * Docker pre-req: operator must `docker compose --profile test up -d
 * pg-test` before invoking `pnpm e2e`. We don't auto-spin docker here —
 * that's an env concern (CI services / dev machine).
 */
import { execFileSync } from 'node:child_process';

const TEST_DB_FALLBACK =
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

export default async function globalSetup(): Promise<void> {
  const testUrl = process.env.DATABASE_URL_TEST ?? TEST_DB_FALLBACK;
  process.env.DATABASE_URL = testUrl;

  // Attachment bytes live in Postgres (`attachment_blobs`), reached through
  // the same DATABASE_URL — no separate object-store env to propagate.

  // NOTE: schema 적용(db:migrate)은 더 이상 여기서 하지 않는다. 테스트 DB에
  // 스키마가 이미 존재한다는 전제 — 스키마 적용은 운영자/별도 절차 책임.

  // Truncate + reseed via `tsx scripts/test-db-reset.ts` (= the
  //    `e2e:reset` script). Run as a child process — a dynamic
  //    `import('../scripts/test-db-reset')` from this CJS-loaded
  //    globalSetup only works on Node 22+ (native TS strip); CI runs
  //    Node 20 and throws "Cannot use import statement outside a
  //    module" because Playwright's CJS pirates hook does not intercept
  //    native ESM `import()` calls.
  console.log('[e2e/global-setup] resetting + reseeding test DB…');
  execFileSync('pnpm', ['e2e:reset'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl, DATABASE_URL_TEST: testUrl },
  });

  console.log('[e2e/global-setup] test DB ready.');
}
