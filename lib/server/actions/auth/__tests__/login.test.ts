import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupActionEnv, teardownActionEnv } from './_setup';

// Auth.js's AuthError subclasses (CredentialsSignin, AccessDenied, ...) each set
// an own `type` field. We duck-type a stand-in here rather than importing
// `next-auth` (which drags `next/server` into the node test env and explodes).
function authError(type: string): Error {
  return Object.assign(new Error(type), { type });
}

// Auth.js's signIn() reaches for the production postgres client unless
// stubbed. We mock the entire `@/auth` surface — the action only depends on
// `signIn`, so no other exports need to round-trip.
const signInMock = vi.fn();
vi.mock('@/auth', () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  // `auth`, `signOut`, `handlers` aren't called from loginAction; provide
  // shells so any indirect import (transitive `require.cache`) resolves.
  auth: () => Promise.resolve(null),
  signOut: () => Promise.resolve(),
  handlers: { GET: undefined, POST: undefined },
}));

const { captureActionError } = vi.hoisted(() => ({ captureActionError: vi.fn() }));
vi.mock('@/lib/observability/capture', () => ({ captureActionError }));

import { loginAction } from '../loginAction';

describe('loginAction', () => {
  beforeEach(async () => {
    await setupActionEnv();
    signInMock.mockReset();
    captureActionError.mockReset();
  });
  afterEach(teardownActionEnv);

  it('returns ok:true when Auth.js signIn resolves', async () => {
    signInMock.mockResolvedValue(undefined);
    const r = await loginAction({
      email: 'Kim@Example.com',
      password: 'Password123!',
    });
    expect(r.ok).toBe(true);
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: 'kim@example.com',
      password: 'Password123!',
      redirect: false,
    });
  });

  it('returns ok:false on bad credentials (CredentialsSignin) without capturing', async () => {
    signInMock.mockRejectedValue(authError('CredentialsSignin'));
    const r = await loginAction({
      email: 'kim@example.com',
      password: 'wrong',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CREDENTIALS');
    expect(captureActionError).not.toHaveBeenCalled();
  });

  it('captures unexpected errors but still returns INVALID_CREDENTIALS', async () => {
    const boom = new Error('db connection refused');
    signInMock.mockRejectedValue(boom);
    const r = await loginAction({
      email: 'kim@example.com',
      password: 'Password123!',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CREDENTIALS');
    expect(captureActionError).toHaveBeenCalledWith('loginAction', boom);
  });

  it('rejects malformed input before reaching signIn', async () => {
    const r = await loginAction({
      email: 'not-an-email',
      password: '',
    });
    expect(r.ok).toBe(false);
    expect(signInMock).not.toHaveBeenCalled();
  });
});
