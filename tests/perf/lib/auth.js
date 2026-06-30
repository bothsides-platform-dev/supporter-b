/**
 * Auth helper — Auth.js v5 credentials 로그인
 * 흐름: GET /api/auth/csrf → POST /api/auth/callback/credentials
 * 성공 시 Set-Cookie 헤더(Auth.js v5: authjs.session-token / prod 는
 * __Secure-authjs.session-token)를 포함한 jar 반환
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';

export function login(email, password) {
  // 1. CSRF 토큰 획득
  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, {
    tags: { name: 'csrf' },
  });
  check(csrfRes, { 'csrf 200': (r) => r.status === 200 });

  const { csrfToken } = csrfRes.json();

  // 2. 자격증명 로그인
  const loginRes = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    {
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE_URL}/home`,
      json: 'true',
    },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      redirects: 0, // 리다이렉트를 따르지 않고 쿠키만 수집
      tags: { name: 'login' },
    },
  );

  check(loginRes, {
    'login 302 or 200': (r) => r.status === 302 || r.status === 200,
    // Auth.js v5 쿠키 이름: dev=authjs.session-token, prod=__Secure-authjs.session-token
    // (lib/auth/cookie-config.ts). perf 서버는 NODE_ENV=production 이라 __Secure- 변종.
    'session cookie set': (r) =>
      r.cookies['authjs.session-token'] !== undefined ||
      r.cookies['__Secure-authjs.session-token'] !== undefined,
  });

  return csrfRes.cookies; // k6 jar — 이후 요청에 자동 전송됨
}
