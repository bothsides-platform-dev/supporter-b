import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __getBackend,
  __resetForTest,
  getWorkspaceRepo,
} from '../factory';
import type { WorkspaceRepo } from '../types';

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

  it('rebuilds a stale global repo cache missing WorkspaceRepo.listForUser', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@127.0.0.1:1/x');
    // Mimics Next dev HMR keeping an old DrizzleWorkspaceRepository instance.
    const staleWorkspace = {
      save: async () => {},
      findById: async () => undefined,
      findByShareToken: async () => undefined,
    } satisfies Omit<WorkspaceRepo, 'listForUser' | 'isMember' | 'memberUserIds'>;
    globalThis.__bidit_repos__ = {
      ...(globalThis.__bidit_repos__ ?? {}),
      workspace: staleWorkspace as unknown as WorkspaceRepo,
      __backend: 'drizzle',
    } as typeof globalThis.__bidit_repos__;

    const repo = await getWorkspaceRepo();
    expect(typeof repo.listForUser).toBe('function');
  });

});
