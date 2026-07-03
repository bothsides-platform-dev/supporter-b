/**
 * Master/operator account allowlist — env-driven, edge-safe (pure, no imports).
 *
 * "Who is a master" is decided by the server-only `MASTER_ACCOUNT_EMAILS`
 * environment variable (comma-separated, multiple operators), NOT a DB column.
 * Because this is re-evaluated from a server-only env var on every token pass
 * (see the jwt callback in `auth.config.ts`), `isMaster` cannot be forged via a
 * tampered JWT — there is no DB flag to drift out of sync.
 *
 * Edge-safe: this module is imported by `auth.config.ts` (shared with the Edge
 * `proxy.ts`), so it MUST stay a pure `process.env` read with no Node-only
 * imports.
 */

/** Parse + normalize the allowlist (trim, lowercase, drop empties). */
function allowlist(): Set<string> {
  const raw = process.env.MASTER_ACCOUNT_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/** True when `email` is a configured master/operator account. */
export function isMasterEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return allowlist().has(normalized);
}

/**
 * Whether the Google OAuth client is fully configured. Both halves are required —
 * a half-set client (ID without SECRET) would register/render but fail the OAuth
 * handshake at `signIn('google')` with `error=Configuration`. Shared by the
 * provider registration gate (`auth.ts`) and the UI gate below so they can never
 * diverge.
 */
export function googleClientConfigured(): boolean {
  return !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
}

/**
 * Whether the hidden operator Google-login route (`/login/ops`) should render.
 * Requires BOTH the explicit kill switch (build-time `NEXT_PUBLIC_MASTER_OAUTH_ENABLED`)
 * AND a fully configured Google client (`AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`) —
 * otherwise the page would show a button that calls `signIn('google')` for an
 * unregistered/broken provider (dead end). When either is missing the route 404s.
 * NOTE: this gates the UI only; the security boundary is the default-deny
 * `MASTER_ACCOUNT_EMAILS` allowlist in the Google `signIn` callback.
 */
export function masterOAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED === 'true' && googleClientConfigured();
}
