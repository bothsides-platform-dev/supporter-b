/**
 * Session-cookie config shared by auth.ts (Node) and proxy.ts (Edge).
 * MUST stay import-free of Node-only modules — only reads process.env.
 *
 * AUTH_COOKIE_DOMAIN='.supporter-b.com' makes the cookie valid on both
 * supporter-b.com and partner.supporter-b.com (cross-host SSO). Leave unset
 * locally for a host-only cookie on localhost.
 */
/**
 * Test/perf escape hatch — serve a NON-secure session cookie so an HTTP-only
 * load generator (k6) can replay it across requests. Without this, perf runs
 * `next start` (NODE_ENV=production) which forces a `Secure` session cookie that
 * a plaintext-http client never re-sends → every "authenticated" page actually
 * measures the /login redirect.
 *
 * Self-defending: IGNORED on an https deployment (NEXT_PUBLIC_BASE_URL/AUTH_URL
 * starts with `https://`). So even if `AUTH_INSECURE_COOKIES=true` leaks into the
 * real production env, it cannot weaken the live session cookie — the flag only
 * takes effect on an http origin (perf/local). NEVER rely on it in production.
 */
export function insecureCookiesEnabled(): boolean {
  if (process.env.AUTH_INSECURE_COOKIES !== 'true') return false;
  const origin = process.env.NEXT_PUBLIC_BASE_URL || process.env.AUTH_URL || '';
  return !origin.startsWith('https://');
}

export function sessionCookie() {
  const prod = process.env.NODE_ENV === 'production';
  // `__Secure-` prefix REQUIRES the Secure attribute, so name and `secure` flip
  // together. Insecure mode (perf over http) drops both.
  const secure = prod && !insecureCookiesEnabled();
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  return {
    name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure,
      ...(domain ? { domain } : {}),
    },
  };
}

/**
 * 세션 쿠키를 만료시키는 Set-Cookie 헤더 문자열들.
 *
 * AUTH_COOKIE_DOMAIN 도입(commit 73dbe10) 이전에 발급된 쿠키는 host-only
 * (Domain 속성 없음)이고, 이후 발급분은 Domain=.supporter-b.com 으로 스코프된다.
 * Auth.js signOut() 은 현재 설정의 Domain 으로만 만료를 시도하므로 도메인 속성이
 * 다른 레거시 쿠키는 삭제되지 않고 살아남아 /home↔/login 무한 리다이렉트를 만든다.
 * → host-only 와 도메인-스코프 변종을 둘 다 명시적으로 만료시켜 stale 쿠키를 확실히
 *   제거한다 (루프 근본 원인 제거).
 *
 * 또한 Auth.js 는 ~4KB 초과 세션 쿠키를 base + `.0`/`.1`... 청크로 분할하므로,
 * base 이름과 첫 청크들(`.0`/`.1`)을 함께 만료시킨다. 존재하지 않는 변종을 클리어하는
 * Set-Cookie 는 브라우저에서 no-op 이라 과발행은 무해하다.
 */
export function sessionCookieClearHeaders(): string[] {
  const prod = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  const baseName = prod
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  // base + 첫 두 청크 (실 토큰이 8KB 를 넘겨 `.2` 까지 가는 일은 사실상 없다).
  const names = [baseName, `${baseName}.0`, `${baseName}.1`];
  const attrs = `Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
    prod ? '; Secure' : ''
  }`;
  const headers: string[] = [];
  for (const name of names) {
    headers.push(`${name}=; ${attrs}`); // host-only (레거시 쿠키)
    if (domain) headers.push(`${name}=; ${attrs}; Domain=${domain}`); // 도메인-스코프
  }
  return headers;
}

/**
 * 요청의 `Cookie` 헤더에서 Auth.js 세션 쿠키 변종 이름을 동적으로 수집한다.
 *
 * 정적 `sessionCookieClearHeaders()` 는 표준 3종(base/.0/.1)만 다루지만, 운영에서
 * 무한 리다이렉트 루프를 만드는 stale 쿠키는 `__Host-` prefix·추가 청크(.2)·과거
 * 다른 prefix 등 비표준 변종일 수 있다. 브라우저가 실제 보유한 쿠키는 매 요청의
 * `Cookie` 헤더로 전송되므로(HttpOnly 라도 서버는 읽는다), 여기서 세션 쿠키 패밀리
 * (`authjs.session-token` 을 이름에 포함)만 골라내 그 변종들을 정확히 만료 대상으로
 * 삼는다. 비세션 쿠키(csrf-token·앱 쿠키)는 제외한다.
 */
export function parseSessionCookieNames(cookieHeader: string): string[] {
  const names: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (!name) continue;
    // 세션 쿠키 패밀리만: `authjs.session-token`(과 prefix/청크 변종)을 포함.
    // `authjs.csrf-token` 등 다른 auth 쿠키는 제외.
    if (name.includes('authjs.session-token') && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * `sessionCookieClearHeaders()` 의 동적 버전 — 정적 표준 3종에 더해, 요청 `Cookie`
 * 헤더에서 본 실제 세션 쿠키 변종까지 만료시킨다. 표준 헬퍼의 상위집합이라 기존
 * 동작을 보존하면서 비표준 stale 변종(루프 원인)을 추가로 제거한다.
 */
export function sessionCookieClearHeadersFor(cookieHeader: string): string[] {
  const prod = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  const baseName = prod
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  const standard = [baseName, `${baseName}.0`, `${baseName}.1`];
  const seen = parseSessionCookieNames(cookieHeader);
  // 표준 + 동적 수집명의 합집합 (중복 제거).
  const names = [...new Set([...standard, ...seen])];
  const attrs = `Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
    prod ? '; Secure' : ''
  }`;
  const headers: string[] = [];
  for (const name of names) {
    headers.push(`${name}=; ${attrs}`); // host-only
    // `__Host-` prefix 쿠키는 RFC상 Domain 속성 금지 → Domain= 헤더는 no-op 죽은
    // 헤더라 발행하지 않는다. 그 외 변종만 도메인-스코프로도 만료.
    if (domain && !name.startsWith('__Host-')) {
      headers.push(`${name}=; ${attrs}; Domain=${domain}`); // 도메인-스코프
    }
  }
  return headers;
}
