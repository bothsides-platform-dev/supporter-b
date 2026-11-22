import { afterEach, beforeEach, expect, it } from 'vitest';

import authConfig from '@/auth.config';
import { authorizeCredentials } from '@/lib/auth/credentials';
import { makeNodeJwtCallback } from '@/lib/auth/master-login';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { runPerfSeed } from '@/scripts/perf-seed';

let db: PgliteDB;

beforeEach(async () => {
  db = await createPgliteDb();
  __resetForTest();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => __resetForTest());

// Login alone is not enough: every later request re-derives the workspace claim,
// and drops it for ids that fail z.uuid(). k6 would then measure /login instead.
it.each(['buyer', 'pg'] as const)('perf %s 계정은 세션 갱신 뒤에도 워크스페이스를 유지한다', async (type) => {
  const seed = await runPerfSeed(db as never);
  const account = type === 'buyer'
    ? { email: seed.buyerEmail, password: seed.buyerPassword, workspaceId: seed.buyerWsId }
    : { email: seed.pgEmails[0], password: seed.pgPassword, workspaceId: seed.pgWsIds[0] };

  const user = await authorizeCredentials(db, account);
  expect(user?.workspaceId).toBe(account.workspaceId);

  const jwt = makeNodeJwtCallback(db, authConfig.callbacks.jwt as never);
  const signedIn = await jwt({ token: {}, user, account: { provider: 'credentials' } });
  const refreshed = await jwt({ token: signedIn });

  expect(refreshed).toMatchObject({ workspaceId: account.workspaceId, workspaceType: type });
});
