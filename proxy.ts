import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import authConfig from './auth.config';
import { decideProxyRoute } from './lib/auth/route-decision';
import { RL_BREAK } from './lib/auth/logout-loop';

// Edge-runtime-only: instantiated from `auth.config.ts` (no DB, no bcrypt).
// `auth.ts` would pull postgres-js into the edge bundle and break the build.
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  const isAuthenticated = !!req.auth;
  // 루프 회로차단기 탈출 플래그. decideProxyRoute 가 escape 보다 평소 라우팅을
  // 우선시키지 않도록(우선순위는 그 순수 함수가 소유) 값만 넘긴다.
  const breakFlag = req.cookies.get(RL_BREAK)?.value;
  const decision = decideProxyRoute(pathname, search, isAuthenticated, breakFlag);

  // escape: /logout 회로차단기가 트립한 뒤 도착한 /login. authed 이지만 막힌 세션이라도
  // /home 으로 되튕기지 않고 /login 을 실제로 렌더한다(쿠키 클리어가 끝내 실패해도
  // 재로그인으로 복구 가능). 플래그는 한 번 쓰고 만료시킨다.
  if (decision.kind === 'escape') {
    const res = NextResponse.next();
    res.cookies.delete(RL_BREAK);
    return res;
  }
  if (decision.kind === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, req.url));
  }
  return NextResponse.next();
});

// Excludes external telemetry proxies (Sentry `/monitoring`, next-axiom
// `/_axiom/*` beacons), `/api` (especially `/api/auth/*` for NextAuth
// handlers), Next internals/static assets, Next.js metadata file
// conventions (robots.txt, sitemap.xml, manifest.webmanifest, opengraph-image,
// twitter-image, icon.svg, apple-icon), and `public/landing/**` marketing
// images — all of which must serve to unauth users (SEO/social-card crawlers,
// anonymous landing-page visitors, and next/image's own internal optimizer
// fetch, which re-requests local sources unauthenticated).
//
// Inlined as a string literal: Next.js statically analyzes `config.matcher` at
// build time WITHOUT executing the module, so an imported/computed value fails
// the build with "matcher[0] need to be static strings or static objects". The
// canonical, documented segment list lives in `lib/auth/proxy-matcher.ts`
// (PROXY_MATCHER); `proxy-matcher.test.ts` pins this literal equal to it so the
// two cannot drift.
export const config = {
  matcher: [
    '/((?!monitoring|_axiom|api|_next|favicon\\.ico|icon\\.svg|apple-icon|opengraph-image|twitter-image|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|llms\\.txt|llms-full\\.txt|landing|fonts|file|globe|next|vercel|window).*)',
  ],
};
