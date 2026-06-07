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
  getBidRepo,
  getContractRepo,
  getInvitationRepo,
  getOutboxRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  __setNtsClientForTest,
  __resetNtsRateLimitForTest,
} from '@/lib/integrations/nts';
import { MockNtsClient } from '@/lib/integrations/nts.mock';
import { RfpService, __setRfpServiceForTest, __resetRfpServiceForTest } from '@/lib/server/services/rfp';
import { BidService, __setBidServiceForTest, __resetBidServiceForTest } from '@/lib/server/services/bid';

export async function setupRfpActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  __setNtsClientForTest(new MockNtsClient());
  __resetNtsRateLimitForTest();

  // Inject services backed by the same PGlite db so action tests pass through.
  const [rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo, invRepo] = await Promise.all([
    getRfpRepo(), getContractRepo(), getOutboxRepo(), getWorkspaceRepo(), getBidRepo(),
    getInvitationRepo(),
  ]);
  __setRfpServiceForTest(new RfpService(db, rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo));
  __setBidServiceForTest(new BidService(db, bidRepo, invRepo));

  return db;
}

export function teardownRfpActionEnv(): void {
  __setActionDbForTest(undefined);
  __setNtsClientForTest(undefined);
  __resetRfpServiceForTest();
  __resetBidServiceForTest();
  __resetForTest();
}
