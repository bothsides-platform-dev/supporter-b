import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __getBackend,
  __resetForTest,
} from '../factory';

describe('repository factory', () => {
  beforeEach(() => {
    __resetForTest();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    __resetForTest();
    vi.unstubAllEnvs();
  });

  it('selects drizzle backend when NODE_ENV=production and REPO_BACKEND unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REPO_BACKEND', '');
    // postgres.js is lazy — construction needs a syntactically-valid URL but
    // does not connect. We don't query, just verify backend selection.
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@127.0.0.1:1/x');
    const backend = await __getBackend();
    expect(backend).toBe('drizzle');
  });

});
