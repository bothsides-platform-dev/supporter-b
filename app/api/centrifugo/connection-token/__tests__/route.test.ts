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

beforeEach(() => {
  sessionRef.value = null;
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
