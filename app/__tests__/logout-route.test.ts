/**
 * @vitest-environment node
 */
// GET /logout — 강제 로그아웃 후 /login 으로 보내 무한 리다이렉트 루프를 끊는다.
// (app) 가드가 "JWT는 유효하지만 워크스페이스를 못 쓰는" 세션을 이리로 보내면,
// 세션 쿠키가 비워진 채 /login 에 도달하므로 미들웨어가 더는 /home 으로 되튕기지
// 않는다 (ERR_TOO_MANY_REDIRECTS 종료). 서버 redirect() 는 GET 을 일으키므로
// 기존 POST 핸들러로는 부족하고 GET 핸들러가 필요하다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn();
vi.mock('@/auth', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

import { GET, POST } from '../logout/route';

describe('GET /logout', () => {
  beforeEach(() => signOutMock.mockReset());

  it('세션을 비우고 /login 으로 리다이렉트한다', async () => {
    signOutMock.mockResolvedValue(undefined);

    const res = await GET(new Request('https://supporter-b.com/logout'));

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://supporter-b.com/login');
  });

  it('Caddy 뒤 프로덕션 환경 — req.url이 localhost:3000이어도 Host 헤더 도메인으로 리다이렉트한다', async () => {
    signOutMock.mockResolvedValue(undefined);

    // Next.js는 next start -p 3000에서 hostname을 'localhost'로 채워
    // req.url을 'https://localhost:3000/logout'으로 구성한다.
    // Caddy는 실제 도메인을 Host 헤더로 전달하므로 이를 우선 사용해야 한다.
    const req = new Request('https://localhost:3000/logout', {
      headers: { host: 'supporter-b.com', 'x-forwarded-proto': 'https' },
    });

    const res = await GET(req);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://supporter-b.com/login');
  });
});

describe('POST /logout', () => {
  beforeEach(() => signOutMock.mockReset());

  it('세션을 비우고 204 를 반환한다 (클라이언트가 직접 /login 으로 이동)', async () => {
    signOutMock.mockResolvedValue(undefined);

    const res = await POST();

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    expect(res.status).toBe(204);
  });
});
