import { NextResponse } from 'next/server';
import { signOut } from '@/auth';

export async function POST() {
  await signOut({ redirect: false });
  return new NextResponse(null, { status: 204 });
}

// GET 진입점 — (app) 가드가 "JWT는 유효하지만 워크스페이스를 못 쓰는" 세션을 서버
// redirect('/logout') 로 보낼 때 쓰인다. redirect() 는 GET 을 일으키므로 POST 만으로는
// 부족하다. signOut 으로 세션 쿠키를 비운 뒤 /login 으로 보내면, 쿠키가 사라진 채
// 도착해 미들웨어(proxy.ts)가 더는 인증 사용자를 /home 으로 되튕기지 않는다
// → /home ↔ /login 무한 리다이렉트(ERR_TOO_MANY_REDIRECTS) 종료.
export async function GET(req: Request) {
  await signOut({ redirect: false });
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
  return NextResponse.redirect(`${origin}/login`, 303);
}
