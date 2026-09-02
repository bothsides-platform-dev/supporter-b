// Test harness for buyer-side RFP actions.
//
// One injection point: `__useDrizzleWithDbForTest(db)` installs the PGlite repo
// bundle, and every service builds itself from that bundle (`getDb()` +
// `get*Repo()`), so nothing here re-wires a service by hand. What remains:
//   - Mock NtsClient injection (lookupBizNoAction)
//   - service cache resets, so a test never reuses a service built on the
//     previous test's bundle
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
import { __resetRfpServiceForTest } from '@/lib/server/services/rfp';
import { __resetBidServiceForTest } from '@/lib/server/services/bid';
import { __resetChatServiceForTest } from '@/lib/server/services/chat';
import { __resetWorkspaceServiceForTest } from '@/lib/server/services/workspace';
import { __resetTeamChatServiceForTest } from '@/lib/server/services/team-chat';
import { __resetBoardServiceForTest } from '@/lib/server/services/board';
import { __resetQuoteTemplateServiceForTest } from '@/lib/server/services/quote-template';

function resetServices(): void {
  __resetRfpServiceForTest();
  __resetBidServiceForTest();
  __resetChatServiceForTest();
  __resetWorkspaceServiceForTest();
  __resetTeamChatServiceForTest();
  __resetBoardServiceForTest();
  __resetQuoteTemplateServiceForTest();
}

export async function setupRfpActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  resetServices();
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
  resetServices();
  __resetForTest();
}
