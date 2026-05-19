import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAPTCHA_THRESHOLD,
  LOCK_THRESHOLD,
  LOGIN_LOCK_DURATION_MS,
  getState,
  recordFailure,
  resetAttempts,
  type AttemptsStorage,
} from '../login-attempts';

function memoryStorage(): AttemptsStorage {
  const m = new Map<string, string>();
  return {
    get: (k) => {
      const raw = m.get(k);
      return raw ? JSON.parse(raw) : null;
    },
    set: (k, v) => {
      m.set(k, JSON.stringify(v));
    },
    remove: (k) => {
      m.delete(k);
    },
  };
}

let storage: AttemptsStorage;
const NOW = 1_700_000_000_000; // fixed clock for deterministic locks

beforeEach(() => {
  storage = memoryStorage();
});

describe('login-attempts constants', () => {
  it('5회는 캡차, 10회는 락, 15분 락 — SPEC §8.1 정책 표', () => {
    expect(CAPTCHA_THRESHOLD).toBe(5);
    expect(LOCK_THRESHOLD).toBe(10);
    expect(LOGIN_LOCK_DURATION_MS).toBe(15 * 60 * 1000);
  });
});

describe('getState — fresh user', () => {
  it('returns count=0, no captcha, no lock', () => {
    const s = getState('kim@example.com', storage, NOW);
    expect(s).toEqual({ count: 0, lockedUntilTs: null, captchaRequired: false });
  });

  it('normalises email so different casing shares one bucket', () => {
    recordFailure('Kim@example.com', storage, NOW);
    expect(getState('kim@example.com', storage, NOW).count).toBe(1);
    expect(getState('KIM@EXAMPLE.COM', storage, NOW).count).toBe(1);
  });
});

describe('recordFailure — captcha threshold', () => {
  it('returns captchaRequired=false for first 4 failures', () => {
    for (let i = 1; i <= 4; i++) {
      const s = recordFailure('kim@example.com', storage, NOW);
      expect(s.count).toBe(i);
      expect(s.captchaRequired).toBe(false);
      expect(s.lockedUntilTs).toBeNull();
    }
  });

  it('flips captchaRequired=true on the 5th failure and stays until 10th', () => {
    for (let i = 1; i <= 4; i++) recordFailure('kim@example.com', storage, NOW);
    const fifth = recordFailure('kim@example.com', storage, NOW);
    expect(fifth.count).toBe(5);
    expect(fifth.captchaRequired).toBe(true);
    expect(fifth.lockedUntilTs).toBeNull();

    for (let i = 6; i <= 9; i++) {
      const s = recordFailure('kim@example.com', storage, NOW);
      expect(s.count).toBe(i);
      expect(s.captchaRequired).toBe(true);
      expect(s.lockedUntilTs).toBeNull();
    }
  });
});

describe('recordFailure — lock threshold', () => {
  it('on the 10th failure, sets lockedUntilTs to now + 15min', () => {
    for (let i = 1; i <= 9; i++) recordFailure('kim@example.com', storage, NOW);
    const tenth = recordFailure('kim@example.com', storage, NOW);
    expect(tenth.count).toBe(10);
    expect(tenth.lockedUntilTs).toBe(NOW + LOGIN_LOCK_DURATION_MS);
  });

  it('does not double the lock window on the 11th-and-after failures while still locked', () => {
    for (let i = 1; i <= 10; i++) recordFailure('kim@example.com', storage, NOW);
    const eleventh = recordFailure(
      'kim@example.com',
      storage,
      NOW + 60_000, // 1 min later, still locked
    );
    // Either keep count incrementing while locked, or freeze it — both are
    // defensible. What MUST hold: the lock window stays anchored at the 10th
    // failure (no rolling/refreshing).
    expect(eleventh.lockedUntilTs).toBe(NOW + LOGIN_LOCK_DURATION_MS);
  });
});

describe('getState — lock expiry auto-resets', () => {
  it('returns fresh state once the lock window has elapsed', () => {
    for (let i = 1; i <= 10; i++) recordFailure('kim@example.com', storage, NOW);

    const justAfter = getState(
      'kim@example.com',
      storage,
      NOW + LOGIN_LOCK_DURATION_MS + 1,
    );
    expect(justAfter.count).toBe(0);
    expect(justAfter.captchaRequired).toBe(false);
    expect(justAfter.lockedUntilTs).toBeNull();
  });

  it('still locked exactly at lockedUntilTs (inclusive end is locked)', () => {
    for (let i = 1; i <= 10; i++) recordFailure('kim@example.com', storage, NOW);
    const atBoundary = getState(
      'kim@example.com',
      storage,
      NOW + LOGIN_LOCK_DURATION_MS,
    );
    // Boundary policy choice — but lockedUntilTs should still be set.
    expect(atBoundary.lockedUntilTs).not.toBeNull();
  });
});

describe('resetAttempts', () => {
  it('clears the bucket after a successful login', () => {
    for (let i = 1; i <= 6; i++) recordFailure('kim@example.com', storage, NOW);
    resetAttempts('kim@example.com', storage);
    expect(getState('kim@example.com', storage, NOW)).toEqual({
      count: 0,
      lockedUntilTs: null,
      captchaRequired: false,
    });
  });
});
