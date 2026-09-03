// Shared helpers for the 8 auth server actions.
// - Action results are JSON only (no redirect()/cookies()) so the client
//   can decide what to do next (sessionStorage hand-off + signIn() at the
//   right moment per advisor block C).
// - Outbox enqueue uses minimal placeholder subject/html: Step 10 owns the
//   real templates + Sender. Don't build a template helper here.
import { db as prodDb } from '@/lib/db/client';

import type { ActionResult } from '@/lib/server/actions/_result';

// `T` is the success-payload shape. Default is an empty object so callers
// that don't carry data can write `Promise<AuthActionResult>` without
// listing a generic.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AuthActionResult<T extends object = {}> = ActionResult<T>;

// Tests install a pglite handle here via __setActionDbForTest so the three
// actions that still open their own transaction / read the raw handle
// (auth/loginAction, rfp/setRfpBoardVisibilityAction,
// rfp/updateWorkspaceBizProfileAction) can run against the test schema
// without reaching for the prod postgres-js client. Production reads prodDb.
// Services do NOT use this — they take `getDb()` from repositories/factory.
declare global {
  var __bidit_action_db_override__: unknown | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function actionDb(): any {
  return globalThis.__bidit_action_db_override__ ?? prodDb;
}

// Test-only — install a db handle. Clear with `__setActionDbForTest(undefined)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setActionDbForTest(db: any | undefined): void {
  globalThis.__bidit_action_db_override__ = db;
}

// Default base URL for verify links. Used when building the URL passed to
// the outbox HTML body; Step 10 swaps this for a templated email.
export { baseUrl, adminBaseUrl } from '@/lib/server/env';

// (Step 10) The previous `devLogVerifyLink` console fallback is gone. The
// equivalent dev affordance now lives in `lib/integrations/resend.ts` —
// `ResendSender` logs `[email DEV] event=... to=... subject=... dedupeKey=...`
// when `RESEND_API_KEY` is unset, so every action's verify URL surfaces
// through the unified outbox path instead of action-specific helpers.

export { normalizeEmail, bucket15Min } from '@/lib/server/services/_service-utils';

export function emailDomain(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1);
}

// Postgres unique-violation (23505) detector — implementation lives in
// repositories/utils to avoid action→service layer inversion.
export { isUniqueViolation } from '@/lib/server/repositories/utils';
