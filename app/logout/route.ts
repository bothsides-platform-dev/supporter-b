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
  return NextResponse.redirect(new URL('/login', req.url), 303);
}
