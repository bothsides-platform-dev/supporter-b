/**
 * The path matcher for the auth proxy middleware (`proxy.ts`), kept here as a
 * pure, edge-safe, next-auth-free module so it can be unit-tested without
 * instantiating NextAuth (same rationale as `route-decision.ts`).
 *
 * Each entry below names a path the proxy MUST NOT process — either an external
 * telemetry proxy (Sentry tunnel, Axiom beacons), a NextAuth/API route, a
 * Next.js internal, or a metadata/static asset that must serve to
 * unauthenticated users (SEO + social-card crawlers). Anything not excluded
 * runs through `decideRoute` and may be redirected to `/login`.
 *
 * Two escaping/boundary rules keep the lookahead from over-matching:
 *
 * 1. Dots in filenames are escaped (`\\.`) so the lookahead only matches a
 *    literal dot — not any character. Without escaping, 'llms.txt' in the regex
 *    would also exclude paths like '/llmsXtxt'.
 * 2. Every entry is anchored to a segment boundary (`/` or end of path). The
 *    lookahead used to match a bare *prefix*, so a future real route whose
 *    first segment merely started with an excluded word ('/landing-editor',
 *    '/api-docs') would have skipped the auth proxy entirely.
 */
const EXCLUDED_SEGMENTS = [
  'monitoring', // Sentry tunnelRoute
  '_axiom', // next-axiom web-vitals/logs beacons (rewritten to api.axiom.co)
  'api', // NextAuth handlers + route handlers
  '_next',
  'favicon\\.ico',
  'icon\\.svg',
  'manifest\\.webmanifest',
  'robots\\.txt',
  'sitemap\\.xml',
  'llms\\.txt', // AI/GEO text endpoint — serve to unauth crawlers (app/llms.txt)
  'llms-full\\.txt', // full markdown export (app/llms-full.txt)
  'naverc0e607e11bc419371519800f1235a0b4\\.html', // Naver Search Advisor site-verification file (public/)
  // Reserved for public/landing/** marketing images. The files themselves were
  // removed when the landing hero moved to in-component mockups, but the entry
  // is kept so reintroducing them cannot silently regress into the
  // /login-redirect bug that broke anonymous landing images once before — with
  // segment boundaries enforced it now excludes only '/landing' and
  // '/landing/**', never a '/landing-*' route.
  'landing',
  'fonts', // public/fonts/** — self-hosted Pretendard + JetBrains Mono
] as const;

/**
 * Next.js metadata *image* conventions, which arrive with the file extension
 * appended (`app/opengraph-image.png` is served at '/opengraph-image.png', and
 * its companion alt text at '/opengraph-image.alt.txt'). These therefore need a
 * relaxed boundary that tolerates an extension — but only after a `.` or `-`,
 * so it cannot decay back into the bare prefix match rule 2 above removes.
 */
const EXCLUDED_ASSET_PREFIXES = ['opengraph-image', 'twitter-image', 'apple-icon'] as const;

// A segment ends at a '/' or at the end of the path — never mid-word.
const SEGMENT_END = '(?:/|$)';
// '.png', '.alt.txt', '-<buildhash>.png' — an extension/hash suffix, not a word.
const ASSET_SUFFIX = '(?:[-.][^/]*)?';

export const PROXY_MATCHER =
  `/((?!(?:${EXCLUDED_SEGMENTS.join('|')})${SEGMENT_END}` +
  `|(?:${EXCLUDED_ASSET_PREFIXES.join('|')})${ASSET_SUFFIX}${SEGMENT_END}).*)`;
