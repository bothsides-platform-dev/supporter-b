import { describe, it, expect, afterEach, vi } from 'vitest';
import { sessionCookie, sessionCookieClearHeaders } from '../cookie-config';

const env = { ...process.env };
afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...env };
});

describe('sessionCookie', () => {
  it('scopes the cookie to the parent domain when AUTH_COOKIE_DOMAIN is set', () => {
    process.env.AUTH_COOKIE_DOMAIN = '.supporter-b.com';
    vi.stubEnv('NODE_ENV', 'production');
    const c = sessionCookie();
    expect(c.options.domain).toBe('.supporter-b.com');
    expect(c.options.secure).toBe(true);
    expect(c.options.sameSite).toBe('lax');
    expect(c.options.httpOnly).toBe(true);
    expect(c.name).toBe('__Secure-authjs.session-token');
  });

  it('omits the domain (host-only) and drops the __Secure- prefix outside production', () => {
    delete process.env.AUTH_COOKIE_DOMAIN;
    vi.stubEnv('NODE_ENV', 'development');
    const c = sessionCookie();
    expect(c.options.domain).toBeUndefined();
    expect(c.options.secure).toBe(false);
    expect(c.name).toBe('authjs.session-token');
  });
});

describe('sessionCookieClearHeaders', () => {
  // Auth.js 는 ~4KB 초과 세션 쿠키를 base + .0/.1... 청크로 분할한다. 레거시
  // 청크 쿠키가 살아남아 루프를 재유발하지 못하도록 base 이름과 첫 청크들을
  // 모두 만료시킨다 (존재하지 않는 변종 클리어는 브라우저에서 no-op).
  const PROD_NAMES = [
    '__Secure-authjs.session-token=',
    '__Secure-authjs.session-token.0=',
    '__Secure-authjs.session-token.1=',
  ];
  const DEV_NAMES = [
    'authjs.session-token=',
    'authjs.session-token.0=',
    'authjs.session-token.1=',
  ];

  it('expires base + chunk variants in both host-only and domain scope (production)', () => {
    // 도메인 설정 후 발급된 현행 쿠키(Domain=.supporter-b.com)와, 그 이전
    // 발급된 레거시 host-only 쿠키를 둘 다 만료시켜야 stale 쿠키가 살아남지
    // 못한다 — 이게 무한 리다이렉트 루프의 근본 원인 제거점이다.
    process.env.AUTH_COOKIE_DOMAIN = '.supporter-b.com';
    vi.stubEnv('NODE_ENV', 'production');

    const headers = sessionCookieClearHeaders();

    // base + .0 + .1, 각각 host-only + 도메인-스코프 = 6
    expect(headers).toHaveLength(6);
    for (const h of headers) {
      expect(h).toContain('__Secure-authjs.session-token');
      expect(h).toContain('Max-Age=0');
      expect(h).toContain('Path=/');
      expect(h).toContain('Secure');
      expect(h).toContain('HttpOnly');
    }
    // 각 이름(base/.0/.1)이 host-only(Domain 없음) + 도메인-스코프 둘 다로 존재
    for (const name of PROD_NAMES) {
      expect(
        headers.some((h: string) => h.startsWith(name) && !h.includes('Domain=')),
      ).toBe(true);
      expect(
        headers.some(
          (h: string) =>
            h.startsWith(name) && h.includes('Domain=.supporter-b.com'),
        ),
      ).toBe(true);
    }
  });

  it('expires base + chunk variants host-only only (no Secure) outside production', () => {
    delete process.env.AUTH_COOKIE_DOMAIN;
    vi.stubEnv('NODE_ENV', 'development');

    const headers = sessionCookieClearHeaders();

    expect(headers).toHaveLength(3);
    for (const h of headers) {
      expect(h).not.toContain('__Secure-');
      expect(h).toContain('Max-Age=0');
      expect(h).not.toContain('Secure');
      expect(h).not.toContain('Domain=');
    }
    for (const name of DEV_NAMES) {
      expect(headers.some((h: string) => h.startsWith(name))).toBe(true);
    }
  });
});
