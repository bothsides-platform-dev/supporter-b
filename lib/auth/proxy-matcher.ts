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
 */
const EXCLUDED_SEGMENTS = [
  'monitoring', // Sentry tunnelRoute
  '_axiom', // next-axiom web-vitals/logs beacons (rewritten to api.axiom.co)
  'api', // NextAuth handlers + route handlers
  '_next',
  'favicon.ico',
  'icon.svg',
  'apple-icon',
  'opengraph-image',
  'twitter-image',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'fonts',
  'file',
  'globe',
  'next',
  'vercel',
  'window',
] as const;

export const PROXY_MATCHER = `/((?!${EXCLUDED_SEGMENTS.join('|')}).*)`;
