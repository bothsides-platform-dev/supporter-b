import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  sessionCookie,
  sessionCookieClearHeaders,
  parseSessionCookieNames,
  sessionCookieClearHeadersFor,
} from '../cookie-config';

const env = { ...process.env };
afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...env };
});

describe('sessionCookie', () => {
  it('scopes the cookie to the parent domain when AUTH_COOKIE_DOMAIN is set', () => {
    process.env.AUTH_COOKIE_DOMAIN = '.support-b.com';
    vi.stubEnv('NODE_ENV', 'production');
    const c = sessionCookie();
    expect(c.options.domain).toBe('.support-b.com');
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

  // perf 회귀 방지: production(next start) + 평문 http 로드 제너레이터(k6)는
  // Secure 세션 쿠키를 재전송하지 못해 인증 화면을 측정하지 못한다. AUTH_INSECURE_COOKIES
  // 로 그 환경에서만 비-Secure 쿠키를 발급한다 — 단, https 배포에선 무시(실 prod 보호).
  it('serves a NON-secure session cookie when AUTH_INSECURE_COOKIES=true on an http deployment', () => {
    delete process.env.AUTH_COOKIE_DOMAIN;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_INSECURE_COOKIES', 'true');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3002');
    const c = sessionCookie();
    expect(c.options.secure).toBe(false);
    // __Secure- prefix REQUIRES Secure, so the name must drop it too.
    expect(c.name).toBe('authjs.session-token');
  });

  it('IGNORES AUTH_INSECURE_COOKIES on an https deployment — cannot weaken real production', () => {
    delete process.env.AUTH_COOKIE_DOMAIN;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_INSECURE_COOKIES', 'true');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://support-b.com');
    const c = sessionCookie();
    expect(c.options.secure).toBe(true);
    expect(c.name).toBe('__Secure-authjs.session-token');
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
    // 도메인 설정 후 발급된 현행 쿠키(Domain=.support-b.com)와, 그 이전
    // 발급된 레거시 host-only 쿠키를 둘 다 만료시켜야 stale 쿠키가 살아남지
    // 못한다 — 이게 무한 리다이렉트 루프의 근본 원인 제거점이다.
    process.env.AUTH_COOKIE_DOMAIN = '.support-b.com';
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
            h.startsWith(name) && h.includes('Domain=.support-b.com'),
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

describe('parseSessionCookieNames', () => {
  it('extracts every session-token variant (prefix + chunk) and ignores non-session cookies', () => {
    const header =
      '__Secure-authjs.session-token=aaa; foo=bar; ' +
      '__Host-authjs.session-token.0=bbb; theme=dark; authjs.csrf-token=ccc';
    const names = parseSessionCookieNames(header);
    expect(names).toContain('__Secure-authjs.session-token');
    expect(names).toContain('__Host-authjs.session-token.0');
    // csrf-token is NOT a session cookie
    expect(names).not.toContain('authjs.csrf-token');
    expect(names).not.toContain('foo');
    expect(names).not.toContain('theme');
  });

  it('returns [] for an empty or whitespace-only header', () => {
    expect(parseSessionCookieNames('')).toEqual([]);
    expect(parseSessionCookieNames('   ')).toEqual([]);
  });

  it('dedupes repeated names', () => {
    const header =
      'authjs.session-token=aaa; authjs.session-token=bbb';
    expect(parseSessionCookieNames(header)).toEqual(['authjs.session-token']);
  });
});

describe('sessionCookieClearHeadersFor', () => {
  it('clears a stale chunk variant seen in the request that the static helper would miss', () => {
    // 루프의 원인이 되는 stale 쿠키가 표준 3종(base/.0/.1) 밖의 변종(.2 청크 등)일
    // 때, 정적 헬퍼는 못 지운다. 요청 Cookie 헤더에서 실제 보유한 세션 쿠키명을
    // 동적 수집해 그 변종까지 host-only + 도메인-스코프 둘 다로 만료시킨다.
    process.env.AUTH_COOKIE_DOMAIN = '.support-b.com';
    vi.stubEnv('NODE_ENV', 'production');

    const header = '__Secure-authjs.session-token.2=stale; other=1';
    const headers = sessionCookieClearHeadersFor(header);

    expect(
      headers.some(
        (h) =>
          h.startsWith('__Secure-authjs.session-token.2=') && !h.includes('Domain='),
      ),
    ).toBe(true);
    expect(
      headers.some(
        (h) =>
          h.startsWith('__Secure-authjs.session-token.2=') &&
          h.includes('Domain=.support-b.com'),
      ),
    ).toBe(true);
    for (const h of headers) {
      expect(h).toContain('Max-Age=0');
      expect(h).toContain('Path=/');
    }
  });

  it('does NOT emit a Domain= variant for __Host- names (RFC forbids it — dead header)', () => {
    // `__Host-` prefix 쿠키는 RFC상 Domain 속성 금지 → Domain= 만료 헤더는
    // 브라우저에서 no-op(죽은 헤더). host-only 변종만 발행한다.
    process.env.AUTH_COOKIE_DOMAIN = '.support-b.com';
    vi.stubEnv('NODE_ENV', 'production');

    const headers = sessionCookieClearHeadersFor(
      '__Host-authjs.session-token=stale',
    );
    const hostName = headers.filter((h) =>
      h.startsWith('__Host-authjs.session-token='),
    );
    // host-only 변종은 존재
    expect(hostName.some((h) => !h.includes('Domain='))).toBe(true);
    // Domain= 변종은 발행하지 않음
    expect(hostName.some((h) => h.includes('Domain='))).toBe(false);
  });

  it('is a superset of the static clear (standard names always present even if not in the header)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.AUTH_COOKIE_DOMAIN;

    // 헤더에 표준 세션 쿠키가 안 보여도 표준 base 이름은 항상 만료 대상
    const headers = sessionCookieClearHeadersFor('unrelated=1');
    expect(
      headers.some((h) => h.startsWith('__Secure-authjs.session-token=')),
    ).toBe(true);
  });

  it('returns standard clears for an empty header', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.AUTH_COOKIE_DOMAIN;
    const headers = sessionCookieClearHeadersFor('');
    expect(headers.length).toBeGreaterThanOrEqual(3);
    expect(
      headers.every((h) => h.includes('Max-Age=0') && h.includes('session-token')),
    ).toBe(true);
  });
});
