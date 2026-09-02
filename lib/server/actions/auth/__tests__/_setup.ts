// Test harness wiring for auth-action tests.
// One injection point: `__useDrizzleWithDbForTest(db)` installs the PGlite
// repo bundle, and AuthService builds itself from that bundle (`getDb()` +
// `get*Repo()`), so nothing here re-wires it by hand.
// `__setActionDbForTest` stays only for the few actions that still open their
// own transaction (signupComplete / passwordReset / emailChangeConfirm).
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import { __resetAuthServiceForTest } from '@/lib/server/services/auth';

export async function setupActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  __resetAuthServiceForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  return db;
}

export function teardownActionEnv(): void {
  __setActionDbForTest(undefined);
  __resetAuthServiceForTest();
  __resetForTest();
}
