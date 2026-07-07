/**
 * The path matcher for the auth proxy middleware (`proxy.ts`), kept here as a
 * pure, edge-safe, next-auth-free module so it can be unit-tested without
 * instantiating NextAuth (same rationale as `route-decision.ts`).
 *
 * Each segment below is a path prefix the proxy MUST NOT process — either an
 * external telemetry proxy (Sentry tunnel, Axiom beacons), a NextAuth/API
 * route, a Next.js internal, or a metadata/static asset that must serve to
 * unauthenticated users (SEO + social-card crawlers). Anything not excluded
 * runs through `decideRoute` and may be redirected to `/login`.
 *
 * Dots in filenames are escaped (`\\.`) so the negative lookahead only matches
 * a literal dot — not any character. Without escaping, 'llms.txt' in the regex
 * would exclude paths like '/llmsXtxt'.
 */
const EXCLUDED_SEGMENTS = [
  'monitoring', // Sentry tunnelRoute
  '_axiom', // next-axiom web-vitals/logs beacons (rewritten to api.axiom.co)
  'api', // NextAuth handlers + route handlers
  '_next',
  'favicon\\.ico',
  'icon\\.svg',
  'apple-icon',
  'opengraph-image',
  'twitter-image',
  'manifest\\.webmanifest',
  'robots\\.txt',
  'sitemap\\.xml',
  'llms\\.txt', // AI/GEO text endpoint — serve to unauth crawlers (app/llms.txt)
  'llms-full\\.txt', // full markdown export (app/llms-full.txt)
  'naverc0e607e11bc419371519800f1235a0b4\\.html', // Naver Search Advisor site-verification file (public/)
  'landing', // public/landing/** marketing images — must serve to anonymous visitors + next/image's internal optimizer fetch
  'fonts',
  'file',
  'globe',
  'next',
  'vercel',
  'window',
] as const;

export const PROXY_MATCHER = `/((?!${EXCLUDED_SEGMENTS.join('|')}).*)`;
