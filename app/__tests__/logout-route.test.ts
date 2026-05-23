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

import { GET } from '../logout/route';

describe('GET /logout', () => {
  beforeEach(() => signOutMock.mockReset());

  it('세션을 비우고 /login 으로 리다이렉트한다', async () => {
    signOutMock.mockResolvedValue(undefined);

    const res = await GET(new Request('https://bidit.store/logout'));

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://bidit.store/login');
  });
});
