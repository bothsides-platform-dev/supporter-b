import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import {
  LOGIN_LOCK_THRESHOLD,
  LOGIN_LOCK_DURATION_MS,
  checkLoginLock,
  recordLoginFailure,
  clearLoginAttempts,
} from '../login-rate-limit';

const T0 = new Date('2026-06-06T00:00:00.000Z');

beforeEach(async () => {
  // 모듈이 LoginAttemptRepo 를 직접 쓰므로 번들만 설치하면 된다 — db 핸들은 필요 없다.
  await setupServerTestEnv();
});
afterEach(() => {
  // pglite handle is a per-file singleton + TRUNCATE; nothing to close.
  teardownServerTestEnv();
});

describe('login-rate-limit', () => {
  it('fresh email is not locked', async () => {
    const r = await checkLoginLock({ email: 'a@example.com', ip: null, now: T0 });
    expect(r.locked).toBe(false);
    expect(r.lockedUntil).toBeNull();
  });

  it('failures below the threshold do not lock', async () => {
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD - 1; i++) {
      await recordLoginFailure({ email: 'a@example.com', ip: null, now: T0 });
    }
    const r = await checkLoginLock({ email: 'a@example.com', ip: null, now: T0 });
    expect(r.locked).toBe(false);
  });

  it('reaching the threshold locks for the lock duration', async () => {
    let last;
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      last = await recordLoginFailure({ email: 'a@example.com', ip: null, now: T0 });
    }
    expect(last!.locked).toBe(true);
    expect(last!.lockedUntil!.getTime()).toBe(T0.getTime() + LOGIN_LOCK_DURATION_MS);

    const check = await checkLoginLock({ email: 'a@example.com', ip: null, now: T0 });
    expect(check.locked).toBe(true);
  });

  it('lock expires once the duration has elapsed', async () => {
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await recordLoginFailure({ email: 'a@example.com', ip: null, now: T0 });
    }
    const after = new Date(T0.getTime() + LOGIN_LOCK_DURATION_MS + 1000);
    const r = await checkLoginLock({ email: 'a@example.com', ip: null, now: after });
    expect(r.locked).toBe(false);
  });

  it('clearLoginAttempts resets the email bucket (successful login)', async () => {
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await recordLoginFailure({ email: 'a@example.com', ip: null, now: T0 });
    }
    await clearLoginAttempts({ email: 'a@example.com', ip: null });
    const r = await checkLoginLock({ email: 'a@example.com', ip: null, now: T0 });
    expect(r.locked).toBe(false);
  });

  it('clearLoginAttempts also resets the IP bucket when an ip is given', async () => {
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await recordLoginFailure({
        email: `v${i}@example.com`,
        ip: '203.0.113.7',
        now: T0,
      });
    }
    await clearLoginAttempts({ email: 'v0@example.com', ip: '203.0.113.7' });
    const r = await checkLoginLock({
      email: 'fresh@example.com',
      ip: '203.0.113.7',
      now: T0,
    });
    expect(r.locked).toBe(false);
  });

  it('locks by IP independently of email (password spraying)', async () => {
    // Many distinct emails, one IP — the email buckets never reach the
    // threshold but the shared IP bucket does.
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await recordLoginFailure({
        email: `victim${i}@example.com`,
        ip: '203.0.113.7',
        now: T0,
      });
    }
    const r = await checkLoginLock({
      email: 'fresh@example.com',
      ip: '203.0.113.7',
      now: T0,
    });
    expect(r.locked).toBe(true);
  });
});

describe('login-rate-limit — key independence', () => {
  it('a locked email stays locked from a different IP', async () => {
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await recordLoginFailure({ email: 'a@example.com', ip: '10.0.0.1', now: T0 });
    }
    const r = await checkLoginLock({ email: 'a@example.com', ip: '10.0.0.2', now: T0 });
    expect(r.locked).toBe(true);
  });

  it('locking one email does not lock a sibling email that shares no IP key', async () => {
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await recordLoginFailure({ email: 'a@example.com', ip: '10.0.0.1', now: T0 });
    }
    const r = await checkLoginLock({ email: 'b@example.com', ip: null, now: T0 });
    expect(r.locked).toBe(false);
  });
});
