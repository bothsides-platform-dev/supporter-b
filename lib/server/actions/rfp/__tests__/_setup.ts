// Test harness for buyer-side RFP actions.
//
// Mirrors auth/__tests__/_setup.ts but adds:
//   - Mock NtsClient injection (lookupBizNoAction)
//   - requireSession / requireBuyerSession is *not* mocked here; individual
//     test files do `vi.mock('@/lib/auth/session', ...)` because the session
//     value (workspaceId, role) varies per scenario.
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  __setNtsClientForTest,
  __resetNtsRateLimitForTest,
} from '@/lib/integrations/nts';
import { MockNtsClient } from '@/lib/integrations/nts.mock';

export async function setupRfpActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  __setNtsClientForTest(new MockNtsClient());
  __resetNtsRateLimitForTest();
  return db;
}

export function teardownRfpActionEnv(): void {
  __setActionDbForTest(undefined);
  __setNtsClientForTest(undefined);
  __resetForTest();
}
