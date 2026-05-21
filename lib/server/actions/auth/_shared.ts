// Shared helpers for the 8 auth server actions.
// - Action results are JSON only (no redirect()/cookies()) so the client
//   can decide what to do next (sessionStorage hand-off + signIn() at the
//   right moment per advisor block C).
// - Outbox enqueue uses minimal placeholder subject/html: Step 10 owns the
//   real templates + Sender. Don't build a template helper here.
import { db as prodDb } from '@/lib/db/client';

// `T` is the success-payload shape. Default is an empty object so callers
// that don't carry data can write `Promise<AuthActionResult>` without
// listing a generic.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AuthActionResult<T extends object = {}> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// Tests install a pglite handle here via __setActionDbForTest so the few
// actions that need raw drizzle access (the workspace-creation transaction
// in signupCompleteAction, the user UPDATE in passwordResetAction /
// emailChangeConfirmAction) can run against the test schema without
// reaching for the prod postgres-js client. Production reads prodDb.
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
export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000'
  );
}

// (Step 10) The previous `devLogVerifyLink` console fallback is gone. The
// equivalent dev affordance now lives in `lib/integrations/resend.ts` —
// `ResendSender` logs `[email DEV] event=... to=... subject=... dedupeKey=...`
// when `RESEND_API_KEY` is unset, so every action's verify URL surfaces
// through the unified outbox path instead of action-specific helpers.

// 15-minute bucket used for `signup-verify` dedupe keys so a flurry of resend
// clicks within the same window don't spam the queue. Step 1 bucket = floor
// of unix-minutes / 15.
export function bucket15Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (15 * 60_000));
}

// Email normalisation — Auth.js authorize already lowercases + trims; do the
// same here so equal addresses dedupe at the action layer too.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailDomain(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1);
}

// Postgres unique-violation (23505) detector that works in BOTH runtimes:
// postgres-js (prod) exposes `.code` directly; pglite (tests) nests it under
// `.cause.code`. Use this so a duplicate-key catch maps to a friendly error
// while genuinely unexpected DB errors are re-thrown (→ onRequestError/Sentry).
export function isUniqueViolation(err: unknown): boolean {
  const direct = (err as { code?: unknown } | null)?.code;
  const nested = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return direct === '23505' || nested === '23505';
}
