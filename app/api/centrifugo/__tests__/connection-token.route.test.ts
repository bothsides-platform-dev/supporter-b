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
afterEach(() => vi.clearAllMocks());

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
  vi.useRealTimers();
});
