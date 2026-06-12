/**
 * Server-side JWT revocation via `users.session_version`.
 *
 * The JWT carries an `sv` claim stamped at login; bumping the DB column
 * (password reset, email change, account deletion) makes every previously
 * issued token stale. Pure decision here — the cached DB read lives in
 * `session-version-db.ts` so this stays importable from edge-safe code/tests.
 */

/** Tokens issued before the claim existed count as the column default. */
const LEGACY_TOKEN_VERSION = 1;

export function isSessionVersionStale(
  tokenVersion: number | undefined,
  dbVersion: number | null | undefined,
): boolean {
  // No user row → the account is gone; the session must die.
  if (dbVersion === null || dbVersion === undefined) return true;
  return (tokenVersion ?? LEGACY_TOKEN_VERSION) !== dbVersion;
}
