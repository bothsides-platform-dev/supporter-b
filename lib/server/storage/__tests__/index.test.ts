/**
 * @vitest-environment node
 */
// getStorage() factory — picks R2Storage when all 4 R2 env vars are present,
// falls back to InMemoryStorage outside production when env is incomplete,
// and fails fast (throws) in production when env is incomplete. Caching via
// globalThis is exercised too, plus the test-only override hooks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { R2Storage } from '../r2';
import { InMemoryStorage } from '../memory';
import {
  getStorage,
  __setStorageForTest,
  __resetStorageForTest,
} from '../index';

const R2_ENV_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of R2_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  __resetStorageForTest();
});

afterEach(() => {
  for (const key of R2_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  __resetStorageForTest();
  vi.unstubAllEnvs();
});

describe('getStorage()', () => {
  it('returns an R2Storage instance when all 4 R2 env vars are set', () => {
    process.env.R2_ACCOUNT_ID = 'acct-1';
    process.env.R2_ACCESS_KEY_ID = 'key-1';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-1';
    process.env.R2_BUCKET = 'bucket-1';

    const storage = getStorage();
    expect(storage).toBeInstanceOf(R2Storage);
  });

  it('caches the instance across repeated calls', () => {
    process.env.R2_ACCOUNT_ID = 'acct-1';
    process.env.R2_ACCESS_KEY_ID = 'key-1';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-1';
    process.env.R2_BUCKET = 'bucket-1';

    const first = getStorage();
    const second = getStorage();
    expect(second).toBe(first);
  });

  it('falls back to InMemoryStorage when env is incomplete and NODE_ENV is not production', () => {
    // NODE_ENV defaults to 'test' under vitest.
    const storage = getStorage();
    expect(storage).toBeInstanceOf(InMemoryStorage);
  });

  it('throws in production when env is incomplete', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getStorage()).toThrow();
  });

  it('__setStorageForTest overrides getStorage()', () => {
    const fake = new InMemoryStorage();
    __setStorageForTest(fake);
    expect(getStorage()).toBe(fake);
  });
});
