/**
 * Security response headers applied to every route via next.config.ts
 * `headers()`. Kept as a pure module (not inline in next.config) so the set is
 * unit-testable — see lib/__tests__/security-headers.test.ts.
 *
 * X-Frame-Options is SAMEORIGIN, not DENY: the bid-detail PDF preview embeds
 * /api/files/[id] in a same-origin iframe. CSP is deliberately absent — it
 * needs nonce plumbing for Next inline scripts + Channel.io/Sentry allowlists.
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
