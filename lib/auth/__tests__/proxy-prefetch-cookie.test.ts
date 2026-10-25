/**
 * @vitest-environment node
 */
// 라우터 프리페치는 사용자 행동이 아닌 백그라운드 요청이다. Auth.js 프록시는 모든
// 응답에 요청 쿠키를 재서명한 세션 쿠키를 붙이므로, 쿠키 교체(이메일 인증 갱신) 직전에
// 떠난 프리페치의 응답이 늦게 도착하면 폐기된 옛 토큰이 새 쿠키를 덮어쓴다. 프리페치
// 응답에는 세션 쿠키 갱신을 싣지 않는다.
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

// next-auth 의 auth(cb) 미들웨어 동작을 그대로 흉내 낸다: 콜백 응답을 감싼 뒤
// sessionResponse 의 세션 쿠키를 덧붙인다(next-auth lib/index.js finalResponse).
vi.mock('next-auth', () => ({
  default: () => ({
    auth: (cb: (req: NextRequest) => Promise<Response>) => async (req: NextRequest) => {
      const res = new Response(null, await cb(Object.assign(req, { auth: null })));
      res.headers.append('set-cookie', '__Secure-authjs.session-token=resigned; Path=/; HttpOnly; Secure; SameSite=Lax');
      res.headers.append('set-cookie', '__Secure-authjs.session-token.0=; Path=/; Max-Age=0');
      res.headers.append('set-cookie', 'authjs.callback-url=http%3A%2F%2Flocalhost%3A3001; Path=/');
      return res;
    },
  }),
}));

import proxy from '../../../proxy';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3001/', {
    headers: { host: 'localhost:3001', cookie: '__Secure-authjs.session-token=old', ...headers },
  });
}

describe('proxy — 라우터 프리페치의 세션 쿠키', () => {
  it('프리페치 응답에는 세션 쿠키 갱신을 싣지 않고 다른 쿠키는 남긴다', async () => {
    const res = (await proxy(request({ rsc: '1', 'next-router-prefetch': '1' }), {} as never)) as Response;

    const cookies = res.headers.getSetCookie();
    expect(cookies.filter((c) => c.includes('authjs.session-token'))).toEqual([]);
    expect(cookies).toContain('authjs.callback-url=http%3A%2F%2Flocalhost%3A3001; Path=/');
  });

  it('프리페치가 아닌 요청은 세션 쿠키를 그대로 갱신한다', async () => {
    const res = (await proxy(request({ rsc: '1' }), {} as never)) as Response;

    expect(res.headers.getSetCookie()).toContain('__Secure-authjs.session-token=resigned; Path=/; HttpOnly; Secure; SameSite=Lax');
  });
});
