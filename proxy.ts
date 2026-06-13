import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import authConfig from './auth.config';
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
// SEO and social-card crawlers.
//
// Inlined as a string literal: Next.js statically analyzes `config.matcher` at
// build time WITHOUT executing the module, so an imported/computed value fails
// the build with "matcher[0] need to be static strings or static objects". The
// canonical, documented segment list lives in `lib/auth/proxy-matcher.ts`
// (PROXY_MATCHER); `proxy-matcher.test.ts` pins this literal equal to it so the
// two cannot drift.
export const config = {
  matcher: [
    '/((?!monitoring|_axiom|api|_next|favicon.ico|icon.svg|apple-icon|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sitemap.xml|fonts|file|globe|next|vercel|window).*)',
  ],
};
