// Test harness wiring for auth-action tests.
// One injection point: `__useDrizzleWithDbForTest(db)` installs the PGlite
// repo bundle, and AuthService builds itself from that bundle (`getDb()` +
// `get*Repo()`), so nothing here re-wires it by hand. `__resetForTest()` drops
// the bundle AND every service singleton built on it.
// `__setActionDbForTest` stays only for loginAction — the one auth action that
// still reaches `actionDb()` (the other two callers live under actions/rfp).
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';

export async function setupActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  return db;
}

export function teardownActionEnv(): void {
  __setActionDbForTest(undefined);
  __resetForTest();
}
