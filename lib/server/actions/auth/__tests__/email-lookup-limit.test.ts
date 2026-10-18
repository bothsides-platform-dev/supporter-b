import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupActionEnv, teardownActionEnv } from './_setup';
const state = vi.hoisted(() => ({ ip: '198.51.100.1' }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': state.ip }) }));
let clock = Date.now();
beforeEach(async () => {
  clock += 120002;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(clock);
  await setupActionEnv(); state.ip = '198.51.100.1';
});
afterEach(() => { teardownActionEnv(); vi.useRealTimers(); });
it('shares an IP budget across availability and signup email entry points', async () => {
  const { checkEmailAvailableAction } = await import('../checkEmailAvailableAction');
  const { signupEmailAction } = await import('../signupEmailAction');
  for (let i = 0; i < 60; i++) expect(await checkEmailAvailableAction({ email: `user${i}@example.com` })).toEqual({ ok: true });
  expect(await signupEmailAction({ email: 'next@example.com' })).toEqual({ ok: false, error: 'RATE_LIMITED' });
  vi.setSystemTime(clock + 60001);
  expect(await checkEmailAvailableAction({ email: 'next@example.com' })).toEqual({ ok: true });
});
it('bounds the aggregate budget even when callers rotate addresses', async () => {
  const { checkEmailAvailableAction } = await import('../checkEmailAvailableAction');
  for (let i = 0; i < 300; i++) {
    state.ip = `198.51.100.${i}`;
    expect(await checkEmailAvailableAction({ email: `user${i}@example.com` })).toEqual({ ok: true });
  }
  state.ip = 'new-ip';
  expect(await checkEmailAvailableAction({ email: 'next@example.com' })).toEqual({ ok: false, error: 'RATE_LIMITED' });
});
