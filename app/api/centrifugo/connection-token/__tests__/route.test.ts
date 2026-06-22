/**
 * @vitest-environment node
 */
// POST /api/centrifugo/connection-token — issues a short-lived Centrifugo
// connection JWT for the authenticated user. 401 when no session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jwtVerify } from 'jose';

const SECRET = 'route-test-hmac-secret';
const encode = (s: string) => new TextEncoder().encode(s);

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));
// 폐기 세션(sv stale) 차단용 — requireSession 미사용 라우트도 동일 기준 적용.
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));


beforeEach(() => {
  // The route holds a module-scope, per-userId revocation cache (reconnect-storm
  // mitigation). Reset modules so each test gets a fresh cache — otherwise an
  // earlier test's verdict for a shared userId leaks into a later test.
  vi.resetModules();
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
  vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function callPost() {
  const { POST } = await import('../route');
  return POST();
}

describe('POST /api/centrifugo/connection-token', () => {
  it('401 when unauthenticated', async () => {
    const r = await callPost();
    expect(r.status).toBe(401);
  });

  it('returns a connection token signed for the session user', async () => {
    sessionRef.value = { user: { id: 'user-99', email: 'u@x.com' } };

    const r = await callPost();
    expect(r.status).toBe(200);

    const body = await r.json();
    expect(typeof body.token).toBe('string');

    const { payload } = await jwtVerify(body.token, encode(SECRET));
    expect(payload.sub).toBe('user-99');
  });
});

describe('connection-token — 폐기 세션', () => {
  it('sv 가 stale 한(폐기된) 세션은 401', async () => {
    sessionRef.value = { user: { id: 'user-99', email: 'u@x.com', sessionVersion: 1 } };
    getDbSessionVersionMock.mockResolvedValue(2);
    const r = await callPost();
    expect(r.status).toBe(401);
  });
});

describe('connection-token — 이메일 미인증', () => {
  it('미인증 세션은 403', async () => {
    sessionRef.value = { user: { id: 'user-99', email: 'u@x.com', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const r = await callPost();
    expect(r.status).toBe(403);
  });
});
