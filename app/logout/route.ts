import { NextResponse } from 'next/server';
import { signOut } from '@/auth';
import {
  sessionCookieClearHeaders,
  sessionCookieClearHeadersFor,
} from '@/lib/auth/cookie-config';
import {
  RL_BREAK,
  RL_COOKIE,
  parseRlCount,
  planForcedLogout,
} from '@/lib/auth/logout-loop';

// signOut() 은 현행 설정의 도메인-스코프 쿠키만 만료시키므로, 도메인 설정 이전
// 발급된 host-only 레거시 쿠키가 살아남아 무한 리다이렉트를 만든다. 응답에 모든
// 도메인 변종의 만료 헤더를 직접 부착해 stale 쿠키를 확실히 제거한다.
function withCookieClears(res: NextResponse): NextResponse {
  for (const h of sessionCookieClearHeaders()) {
    res.headers.append('set-cookie', h);
  }
  return res;
}

// 짧은 수명의 보조 쿠키(루프 카운터·탈출 플래그) 한 줄 Set-Cookie 문자열.
// maxAge=0 이면 만료(삭제)된다.
function counterCookie(name: string, value: string, maxAge: number): string {
  const prod = process.env.NODE_ENV === 'production';
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${
    prod ? '; Secure' : ''
  }`;
}

export async function POST() {
  await signOut({ redirect: false });
  return withCookieClears(new NextResponse(null, { status: 204 }));
}

// GET 진입점 — (app) 가드가 "JWT는 유효하지만 워크스페이스를 못 쓰는" 세션을 서버
// redirect('/logout') 로 보낼 때 쓰인다. redirect() 는 GET 을 일으키므로 POST 만으로는
// 부족하다. 평소엔 세션 쿠키를 비우고 /login 으로 보낸다.
//
// 회로차단기: stale 쿠키가 끝내 안 지워지면 /logout↔/login↔/home 이 무한 반복된다.
// 이 사이클의 단일 통과점인 /logout GET 진입을 `__rl` 쿠키로 세어, 임계치에 도달하면
// (1) 요청 Cookie 헤더 기반 동적 클리어로 비표준 stale 변종까지 만료시키고,
// (2) `__rl_break` 탈출 플래그를 세워 proxy 가 authed→/home 바운스를 멈추게 하고,
// (3) /login?reason=session 으로 보내 안내 화면에 정착시킨다(무한 루프 종료).
export async function GET(req: Request) {
  await signOut({ redirect: false });

  const cookieHeader = req.headers.get('cookie');
  const plan = planForcedLogout(parseRlCount(cookieHeader));

  // req.url is unreliable behind a proxy: Next.js defaults hostname to 'localhost'
  // (render-server.js) when started without -H, so req.url becomes
  // 'https://localhost:3000/logout' instead of the real domain.
  // Caddy passes the original Host header through, so use it when available.
  // Multi-hop proxy chains can produce comma-separated values (e.g. "https, http").
  // Take only the first to avoid constructing an invalid URL.
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const host = req.headers.get('host');
  const origin =
    proto && host ? `${proto}://${host}` : new URL(req.url).origin;

  const target =
    plan.kind === 'break' ? `${origin}/login?reason=session` : `${origin}/login`;
  const res = NextResponse.redirect(target, 303);

  // 요청에서 실제 본 세션 쿠키 변종까지 동적으로 만료(정적 표준의 상위집합).
  for (const h of sessionCookieClearHeadersFor(cookieHeader ?? '')) {
    res.headers.append('set-cookie', h);
  }

  if (plan.kind === 'break') {
    // 카운터는 리셋(만료)하고 탈출 플래그를 세운다. 플래그는 proxy 가 다음 /login
    // 요청에서 한 번 소비하고 만료시킨다(짧은 수명).
    res.headers.append('set-cookie', counterCookie(RL_COOKIE, '', 0));
    res.headers.append('set-cookie', counterCookie(RL_BREAK, '1', 30));
  } else {
    res.headers.append('set-cookie', counterCookie(RL_COOKIE, String(plan.nextCount), 30));
  }

  return res;
}
