import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
  isEmailUnverified: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/server/realtime/token', () => ({
  issueCentrifugoConnectionToken: vi.fn().mockResolvedValue('tok'),
}));

const load = async () => {
  const route = await import('@/app/api/centrifugo/connection-token/route');
  return route.POST;
};

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('passes the session workspaceId into the token', async () => {
  const { auth } = await import('@/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', workspaceId: 'ws-1' } });
  const { issueCentrifugoConnectionToken } = await import('@/lib/server/realtime/token');
  const POST = await load();

  await POST();

  expect(issueCentrifugoConnectionToken).toHaveBeenCalledWith('u1', 'ws-1');
});

it('caches the revocation check across rapid reconnects (1 DB read for N calls)', async () => {
  const { auth } = await import('@/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', workspaceId: 'ws-1' } });
  const { isSessionRevoked } = await import('@/lib/auth/session');
  const POST = await load();

  await POST();
  await POST();
  await POST();

  expect(isSessionRevoked).toHaveBeenCalledTimes(1);
});

it('still 401s a revoked session after the cache TTL expires', async () => {
  vi.useFakeTimers();
  const { auth } = await import('@/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', workspaceId: 'ws-1' } });
  const { isSessionRevoked } = await import('@/lib/auth/session');
  (isSessionRevoked as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  const POST = await load();

  const res = await POST();
  expect(res.status).toBe(401);
  vi.advanceTimersByTime(11_000);
  const res2 = await POST();
  expect(res2.status).toBe(401);
  // Assert cache re-queried after TTL: isSessionRevoked called twice (once before advance, once after)
  expect(isSessionRevoked).toHaveBeenCalledTimes(2);
});

it('sheds with 503 + jittered Retry-After when over the in-flight cap', async () => {
  // Reconnect-storm load shed: cap concurrent token issuance so a Centrifugo
  // restart can't monopolise the Postgres pool. Cap=0 sheds every request
  // (deterministic) and exercises the shed path BEFORE auth()/DB are touched.
  vi.stubEnv('CENTRIFUGO_TOKEN_MAX_INFLIGHT', '0');
  const { auth } = await import('@/auth');
  const POST = await load();

  const r = await POST();

  expect(r.status).toBe(503);
  const retryAfter = Number(r.headers.get('Retry-After'));
  expect(Number.isInteger(retryAfter)).toBe(true);
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(10);
  // Shed happens before auth() — no DB/CPU work spent on a shed request.
  expect(auth).not.toHaveBeenCalled();
});
