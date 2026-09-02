// Shared test harness for workspace actions.
// One injection point: `__useDrizzleWithDbForTest(db)` installs the PGlite
// repo bundle, and services build themselves from that bundle (`getDb()` +
// `get*Repo()`), so nothing here re-wires a service by hand. `__resetForTest()`
// drops the bundle AND every service singleton built on it. No workspace
// action reaches `actionDb()`, so the action-db override is not installed.
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';

export async function setupWorkspaceActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  return db;
}

export function teardownWorkspaceActionEnv(): void {
  __resetForTest();
}
