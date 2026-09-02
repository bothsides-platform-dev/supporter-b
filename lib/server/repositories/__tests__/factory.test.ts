import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getDb,
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

  it('lazily constructs the drizzle repo bundle from a valid DATABASE_URL', async () => {
    // postgres.js is lazy — construction needs a syntactically-valid URL but
    // does not connect. We don't query, just verify the bundle builds.
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@127.0.0.1:1/x');
    const repo = await getWorkspaceRepo();
    expect(typeof repo.listForUser).toBe('function');
  });

  it('rebuilds a stale global repo cache missing __version', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@127.0.0.1:1/x');
    // Mimics Next dev HMR keeping an old bundle that predates __version.
    globalThis.__bidit_repos__ = {
      ...(globalThis.__bidit_repos__ ?? {}),
      workspace: { save: async () => {}, findById: async () => undefined } as unknown as WorkspaceRepo,
      __version: 0, // stale — below current BUNDLE_VERSION
    } as typeof globalThis.__bidit_repos__;

    const repo = await getWorkspaceRepo();
    expect(typeof repo.listForUser).toBe('function');
  });

  // HMR 이 살려 둔 옛 번들(v19 이하)에는 `db` 필드가 없다. BUNDLE_VERSION 범프가
  // 그 번들을 버리게 만들어야 getDb() 가 undefined 를 돌려주지 않는다 — 범프를
  // 잊으면 여기서 죽는다.
  it('getDb() after a stale-bundle rebuild is the rebuilt handle, not undefined', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@127.0.0.1:1/x');
    globalThis.__bidit_repos__ = {
      ...(globalThis.__bidit_repos__ ?? {}),
      __version: 0, // pre-`db` bundle shape
    } as typeof globalThis.__bidit_repos__;

    const { db } = await import('@/lib/db/client');
    expect(await getDb()).toBe(db);
  });

  // 서비스가 트랜잭션 핸들을 리포와 같은 주입점에서 받아야 테스트 하네스가 서비스를
  // 손으로 재배선하지 않아도 된다 — 번들에 실린 db 가 그 단일 출처다.
  it('getDb() returns the db handle the bundle was built with', async () => {
    const injected = { __tag: 'pglite-stand-in' };
    await __useDrizzleWithDbForTest(injected);

    expect(await getDb()).toBe(injected);
  });

  it('getDb() on the default bundle is the postgres-js drizzle handle from @/lib/db/client', async () => {
    // postgres.js is lazy — a syntactically valid URL builds the client without
    // connecting. Pins that production services transact on the same handle the
    // repos were built with, not a second client.
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@127.0.0.1:1/x');
    const { db } = await import('@/lib/db/client');

    expect(await getDb()).toBe(db);
  });

});
