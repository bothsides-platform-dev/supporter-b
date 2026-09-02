// Buyer RFP-action harness — the shared server harness with the NTS mock
// (lookupBizNoAction / updateWorkspaceBizProfileAction re-verify a business
// number on write). requireSession / requireBuyerSession is *not* mocked here;
// individual test files do `vi.mock('@/lib/auth/session', ...)` because the
// session value (workspaceId, role) varies per scenario.
import type { PgliteDB } from '@/lib/db/client-pglite';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';

export function setupRfpActionEnv(): Promise<PgliteDB> {
  return setupServerTestEnv({ nts: true });
}

export function teardownRfpActionEnv(): void {
  teardownServerTestEnv({ nts: true });
}
