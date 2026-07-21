import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import authConfig from './auth.config';
import { decideProxyRoute } from './lib/auth/route-decision';
import { proxyDecisionUrl } from './lib/auth/proxy-url';
import { RL_BREAK } from './lib/auth/logout-loop';
import { appOrigins, shouldNoindexHost } from './lib/site-routing';

// Edge-runtime-only: instantiated from `auth.config.ts` (no DB, no bcrypt).
// `auth.ts` would pull postgres-js into the edge bundle and break the build.
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  const isAuthenticated = !!req.auth;
  // 루프 회로차단기 탈출 플래그. decideProxyRoute 가 escape 보다 평소 라우팅을
  // 우선시키지 않도록(우선순위는 그 순수 함수가 소유) 값만 넘긴다.
  const breakFlag = req.cookies.get(RL_BREAK)?.value;
  const host = req.headers.get('host');
  const decision = decideProxyRoute(pathname, search, isAuthenticated, breakFlag, host);

  // escape: /logout 회로차단기가 트립한 뒤 도착한 /login. authed 이지만 막힌 세션이라도
  // /home 으로 되튕기지 않고 /login 을 실제로 렌더한다(쿠키 클리어가 끝내 실패해도
  // 재로그인으로 복구 가능). 플래그는 한 번 쓰고 만료시킨다.
  if (decision.kind === 'escape') {
    const res = NextResponse.next();
    res.cookies.delete(RL_BREAK);
    return res;
  }

  let res: Response;
  // 베이스를 req.url 이 아닌 실제 Host 헤더로 복원한다. next-auth 의 auth() 래퍼가
  // AUTH_URL 로 req.url origin 을 치환하므로(reqWithEnvURL), req.url 기준이면
  // partner 호스트의 rewrite/redirect 가 buyer origin 으로 새어 cross-origin 이 된다.
  if (decision.kind === 'redirect') {
    res = NextResponse.redirect(proxyDecisionUrl(decision.to, host, req.nextUrl.protocol, req.url));
  } else if (decision.kind === 'rewrite') {
    res = NextResponse.rewrite(proxyDecisionUrl(decision.to, host, req.nextUrl.protocol, req.url));
  } else {
    res = NextResponse.next();
  }

  // partner 호스트는 robots.txt 의 blanket disallow 를 보강 — 외부 링크로 이미
  // 색인된 페이지도 강제로 빠지도록 응답 헤더에도 noindex 를 싣는다.
  if (shouldNoindexHost(host, appOrigins())) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return res;
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
// Every entry is anchored to a segment boundary ('/' or end of path) so an
// excluded word can never match as a bare prefix of a real route
// ('/landing-editor' must NOT skip the proxy). The metadata *image* conventions
// are the one exception: they arrive with an extension appended
// ('/opengraph-image.png'), so they get a relaxed suffix boundary.
//
// Inlined as a string literal: Next.js statically analyzes `config.matcher` at
// build time WITHOUT executing the module, so an imported/computed value fails
// the build with "matcher[0] need to be static strings or static objects". The
// canonical, documented segment list lives in `lib/auth/proxy-matcher.ts`
// (PROXY_MATCHER); `proxy-matcher.test.ts` pins this literal equal to it so the
// two cannot drift.
export const config = {
  matcher: [
    '/((?!(?:monitoring|_axiom|api|_next|favicon\\.ico|icon\\.svg|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|llms\\.txt|llms-full\\.txt|naverc0e607e11bc419371519800f1235a0b4\\.html|landing|fonts)(?:/|$)|(?:opengraph-image|twitter-image|apple-icon)(?:[-.][^/]*)?(?:/|$)).*)',
  ],
};
