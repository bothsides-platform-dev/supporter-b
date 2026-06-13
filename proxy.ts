import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import authConfig from './auth.config';
import { PROXY_MATCHER } from './lib/auth/proxy-matcher';
import { decideRoute } from './lib/auth/route-decision';

// Edge-runtime-only: instantiated from `auth.config.ts` (no DB, no bcrypt).
// `auth.ts` would pull postgres-js into the edge bundle and break the build.
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;

  const isAuthenticated = !!req.auth;
  const decision = decideRoute(pathname, search, isAuthenticated);

  if (decision.kind === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, req.url));
  }
  return NextResponse.next();
});

// Excludes external telemetry proxies (Sentry `/monitoring`, next-axiom
// `/_axiom/*` beacons), `/api` (especially `/api/auth/*` for NextAuth
// handlers), Next internals/static assets, and Next.js metadata file
// conventions (robots.txt, sitemap.xml, manifest.webmanifest, opengraph-image,
// twitter-image, icon.svg, apple-icon) which must serve to unauth users for
// SEO and social-card crawlers. See `lib/auth/proxy-matcher.ts`.
export const config = {
  matcher: [PROXY_MATCHER],
};
