import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __getBackend,
  __resetForTest,
  getRfpRepo,
  getInvitationRepo,
  getWorkspaceRepo,
} from '../factory';
import { InMemoryRfpRepository } from '../in-memory/rfp';
import { InMemoryInvitationRepository } from '../in-memory/invitation';
import { InMemoryWorkspaceRepository } from '../in-memory/workspace';

describe('repository factory', () => {
  beforeEach(() => {
    __resetForTest();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    __resetForTest();
    vi.unstubAllEnvs();
  });

  it('uses in-memory when NODE_ENV=test (vitest default)', async () => {
    // Vitest sets NODE_ENV='test' for the run; explicit stub for clarity.
    vi.stubEnv('NODE_ENV', 'test');
    const backend = await __getBackend();
    expect(backend).toBe('memory');
    expect(await getRfpRepo()).toBeInstanceOf(InMemoryRfpRepository);
    expect(await getInvitationRepo()).toBeInstanceOf(InMemoryInvitationRepository);
    expect(await getWorkspaceRepo()).toBeInstanceOf(InMemoryWorkspaceRepository);
  });

  it('uses in-memory when REPO_BACKEND=memory regardless of NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REPO_BACKEND', 'memory');
    const backend = await __getBackend();
    expect(backend).toBe('memory');
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

  it('caches the bundle on globalThis (same instance across calls)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const a = await getRfpRepo();
    const b = await getRfpRepo();
    expect(a).toBe(b);
  });
});
