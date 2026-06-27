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

  it('X-Forwarded-Proto가 multi-value("https, http")여도 첫 번째 값으로 올바르게 리다이렉트한다', async () => {
    signOutMock.mockResolvedValue(undefined);

    // CDN → Caddy → Next.js 다단계 프록시에서 X-Forwarded-Proto가
    // 쉼표 구분 복수값("https, http")으로 올 수 있다. split으로 첫 값을
    // 취하지 않으면 new URL("https, http://host/login") 이 TypeError를 던진다.
    const req = new Request('https://localhost:3000/logout', {
      headers: { host: 'supporter-b.com', 'x-forwarded-proto': 'https, http' },
    });

    const res = await GET(req);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://supporter-b.com/login');
  });

  it('카운터가 없으면 평소처럼 /login 으로 보내고 __rl 카운터를 1로 세운다', async () => {
    signOutMock.mockResolvedValue(undefined);

    const res = await GET(new Request('https://supporter-b.com/logout'));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://supporter-b.com/login');
    const setCookies = res.headers.getSetCookie();
    expect(
      setCookies.some((c) => /^__rl=1\b/.test(c) && /Max-Age=\d+/.test(c)),
    ).toBe(true);
  });

  it('카운터가 임계치에 도달하면 회로를 끊는다 — /login?reason=session + __rl 만료 + __rl_break 세팅', async () => {
    // stale 쿠키가 끝내 안 지워져 /logout 이 반복 진입되면, 임계치에서 회로차단기가
    // 트립해 공격적 클리어 + 탈출 플래그로 루프를 끊고 안내 화면으로 보낸다.
    signOutMock.mockResolvedValue(undefined);

    const req = new Request('https://supporter-b.com/logout', {
      headers: { cookie: '__rl=3; __Secure-authjs.session-token=stale' },
    });
    const res = await GET(req);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'https://supporter-b.com/login?reason=session',
    );
    const setCookies = res.headers.getSetCookie();
    // __rl 자체는 만료(다음 진입은 0부터)
    expect(
      setCookies.some((c) => /^__rl=;/.test(c) && c.includes('Max-Age=0')),
    ).toBe(true);
    // proxy 가 authed→/home 바운스를 억제하도록 탈출 플래그를 세운다
    expect(setCookies.some((c) => /^__rl_break=/.test(c) && !/__rl_break=;/.test(c))).toBe(
      true,
    );
  });

  it('레거시 host-only stale 쿠키를 확실히 만료시키는 Set-Cookie 헤더를 부착한다', async () => {
    // 근본 원인: signOut() 은 현행 도메인-스코프 쿠키만 만료시켜, 도메인 설정 이전
    // 발급된 host-only 레거시 쿠키는 살아남아 무한 리다이렉트가 된다. /logout 응답이
    // host-only 변종까지 명시적으로 만료시켜야 stale 쿠키가 제거되고 루프가 끊긴다.
    signOutMock.mockResolvedValue(undefined);

    const res = await GET(new Request('https://supporter-b.com/logout'));

    const setCookies = res.headers.getSetCookie();
    const expired = setCookies.filter(
      (c) => c.includes('session-token=') && c.includes('Max-Age=0'),
    );
    expect(expired.length).toBeGreaterThanOrEqual(1);
    // host-only 변종(Domain 속성 없음)이 반드시 포함되어야 레거시 쿠키가 제거된다
    expect(expired.some((c) => !c.includes('Domain='))).toBe(true);
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

  it('204 응답에도 stale 세션 쿠키 만료 헤더를 부착한다', async () => {
    signOutMock.mockResolvedValue(undefined);

    const res = await POST();

    const expired = res.headers
      .getSetCookie()
      .filter((c) => c.includes('session-token=') && c.includes('Max-Age=0'));
    expect(expired.length).toBeGreaterThanOrEqual(1);
  });
});
