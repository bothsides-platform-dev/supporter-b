// Shared helpers for the auth server actions.
// - Action results are JSON only (no redirect()/cookies()) so the client
//   can decide what to do next (sessionStorage hand-off + signIn() at the
//   right moment per advisor block C).
// - No DB handle lives here any more: every action goes through a repo
//   (`repositories/factory`) or a service, and services take their tx handle
//   from `getDb()` on the same bundle. The old `actionDb()` test-override
//   registry is gone with its last three callers.
import type { ActionResult } from '@/lib/server/actions/_result';

// `T` is the success-payload shape. Default is an empty object so callers
// that don't carry data can write `Promise<AuthActionResult>` without
// listing a generic.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AuthActionResult<T extends object = {}> = ActionResult<T>;

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
