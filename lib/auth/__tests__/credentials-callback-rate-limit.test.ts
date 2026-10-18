import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { users } from '@/lib/db/schema';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { getLoginAttemptRepo } from '@/lib/server/repositories/factory';
import { LOGIN_LOCK_THRESHOLD } from '@/lib/server/auth/login-rate-limit';

const verifyPasswordMock = vi.fn();
vi.mock('@/lib/auth/password', () => ({
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
  hashPassword: (password: string) => Promise.resolve(`hashed:${password}`),
}));

type AuthHandlers = (typeof import('@/auth'))['handlers'];

let handlers: AuthHandlers;
let db: Awaited<ReturnType<typeof setupServerTestEnv>>;
const originalSecret = process.env.AUTH_SECRET;
const originalTrustHost = process.env.AUTH_TRUST_HOST;

async function postCredentials(email: string, password: string, ip: string) {
  const csrfResponse = await handlers.GET(new NextRequest('https://support-b.com/api/auth/csrf'));
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const cookie = csrfResponse.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  return handlers.POST(
    new NextRequest('https://support-b.com/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
        'x-forwarded-for': ip,
      },
      body: new URLSearchParams({
        csrfToken,
        email,
        password,
        callbackUrl: 'https://support-b.com/home',
      }),
    }),
  );
}

beforeAll(async () => {
  process.env.AUTH_SECRET = 'credentials-callback-rate-limit-test-secret';
  process.env.AUTH_TRUST_HOST = 'true';
  ({ handlers } = await import('@/auth'));
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
  if (originalTrustHost === undefined) delete process.env.AUTH_TRUST_HOST;
  else process.env.AUTH_TRUST_HOST = originalTrustHost;
});

beforeEach(async () => {
  db = await setupServerTestEnv();
  verifyPasswordMock.mockReset();
});

afterEach(() => {
  teardownServerTestEnv();
});

describe('public Auth.js credentials callback throttle', () => {
  it('blocks bcrypt after the shared email/IP budget is exhausted', async () => {
    verifyPasswordMock.mockResolvedValue(false);
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await postCredentials('callback-brute@example.com', `wrong-${i}`, '203.0.113.21');
    }
    expect(verifyPasswordMock).toHaveBeenCalledTimes(LOGIN_LOCK_THRESHOLD);

    await postCredentials('callback-brute@example.com', 'blocked-before-bcrypt', '203.0.113.21');

    expect(verifyPasswordMock).toHaveBeenCalledTimes(LOGIN_LOCK_THRESHOLD);
    const repo = await getLoginAttemptRepo();
    expect((await repo.findByKey('email:callback-brute@example.com'))?.lockedUntil).toBeInstanceOf(Date);
    expect((await repo.findByKey('ip:203.0.113.21'))?.lockedUntil).toBeInstanceOf(Date);
  });

  it('still signs in valid credentials and clears both callback buckets', async () => {
    verifyPasswordMock.mockResolvedValue(false);
    await postCredentials('callback-real@example.com', 'wrong', '198.51.100.23');

    await db.insert(users).values({
      email: 'callback-real@example.com',
      passwordHash: 'stored-hash',
      name: 'Callback User',
    });
    verifyPasswordMock.mockResolvedValue(true);
    const response = await postCredentials('callback-real@example.com', 'correct', '198.51.100.23');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://support-b.com/home');
    const repo = await getLoginAttemptRepo();
    expect(await repo.findByKey('email:callback-real@example.com')).toBeUndefined();
    expect(await repo.findByKey('ip:198.51.100.23')).toBeUndefined();
  });
});
