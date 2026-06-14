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
  it('expires both the host-only and the domain-scoped cookie in production', () => {
    // 도메인 설정 후 발급된 현행 쿠키(Domain=.supporter-b.com)와, 그 이전
    // 발급된 레거시 host-only 쿠키를 둘 다 만료시켜야 stale 쿠키가 살아남지
    // 못한다 — 이게 무한 리다이렉트 루프의 근본 원인 제거점이다.
    process.env.AUTH_COOKIE_DOMAIN = '.supporter-b.com';
    vi.stubEnv('NODE_ENV', 'production');

    const headers = sessionCookieClearHeaders();

    expect(headers).toHaveLength(2);
    // 둘 다 prod 쿠키 이름 + Max-Age=0 + Secure + Path=/
    for (const h of headers) {
      expect(h).toContain('__Secure-authjs.session-token=');
      expect(h).toContain('Max-Age=0');
      expect(h).toContain('Path=/');
      expect(h).toContain('Secure');
      expect(h).toContain('HttpOnly');
    }
    // 하나는 host-only(Domain 속성 없음), 하나는 도메인-스코프
    const hostOnly = headers.find((h: string) => !h.includes('Domain='));
    const domainScoped = headers.find((h: string) =>
      h.includes('Domain=.supporter-b.com'),
    );
    expect(hostOnly).toBeDefined();
    expect(domainScoped).toBeDefined();
  });

  it('expires only the host-only cookie (no Secure) outside production', () => {
    delete process.env.AUTH_COOKIE_DOMAIN;
    vi.stubEnv('NODE_ENV', 'development');

    const headers = sessionCookieClearHeaders();

    expect(headers).toHaveLength(1);
    expect(headers[0]).toContain('authjs.session-token=');
    expect(headers[0]).not.toContain('__Secure-');
    expect(headers[0]).toContain('Max-Age=0');
    expect(headers[0]).not.toContain('Secure');
    expect(headers[0]).not.toContain('Domain=');
  });
});
