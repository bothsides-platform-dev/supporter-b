/**
 * Session-cookie config shared by auth.ts (Node) and proxy.ts (Edge).
 * MUST stay import-free of Node-only modules — only reads process.env.
 *
 * AUTH_COOKIE_DOMAIN='.supporter-b.com' makes the cookie valid on both
 * supporter-b.com and partner.supporter-b.com (cross-host SSO). Leave unset
 * locally for a host-only cookie on localhost.
 */
export function sessionCookie() {
  const prod = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  return {
    name: prod ? '__Secure-authjs.session-token' : 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure: prod,
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
 */
export function sessionCookieClearHeaders(): string[] {
  const prod = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  const name = prod ? '__Secure-authjs.session-token' : 'authjs.session-token';
  const base = `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
    prod ? '; Secure' : ''
  }`;
  const headers = [base]; // host-only (레거시 쿠키)
  if (domain) headers.push(`${base}; Domain=${domain}`); // 도메인-스코프 (현행 쿠키)
  return headers;
}
