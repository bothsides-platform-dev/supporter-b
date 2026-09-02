// Shared PGlite harness for server-side tests (actions, loaders, and any
// service test that reaches services through `getXService()`).
//
// One injection point: `__useDrizzleWithDbForTest(db)` installs the PGlite repo
// bundle, and every service builds itself from that bundle (`getDb()` +
// `get*Repo()`) — nothing re-wires a service by hand. `__resetForTest()` drops
// the bundle AND every 'service'-group singleton built on it, so a test never
// reuses a service built on the previous test's bundle. Infra doubles for
// storage / SnowSign are left to the tests that install them.
//
// `nts: true` swaps the NTS (사업자번호 조회) client for the mock — needed by the
// buyer RFP actions that re-verify a business number on write. Teardown always
// clears that override (a no-op when nothing was installed), so a caller cannot
// leak the mock into later tests by forgetting to mirror the option.
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  __setNtsClientForTest,
  __resetNtsRateLimitForTest,
} from '@/lib/integrations/nts';
import { MockNtsClient } from '@/lib/integrations/nts.mock';

export type ServerTestEnvOptions = { nts?: boolean };

export async function setupServerTestEnv(opts: ServerTestEnvOptions = {}): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  if (opts.nts) {
    __setNtsClientForTest(new MockNtsClient());
    __resetNtsRateLimitForTest();
  }
  return db;
}

export function teardownServerTestEnv(): void {
  __setNtsClientForTest(undefined);
  __resetForTest();
}
