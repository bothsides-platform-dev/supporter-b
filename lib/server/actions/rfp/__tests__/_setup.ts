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
  getAttachmentRepo,
  getBidNoteRepo,
  getBidRepo,
  getBizProfileRepo,
  getContractRepo,
  getInvitationRepo,
  getOutboxRepo,
  getPgRequestRepo,
  getRfpAllowedPgRepo,
  getRfpRepo,
  getRfpRequoteRequestRepo,
  getAuditLogRepo,
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
import { ChatService, __setChatServiceForTest, __resetChatServiceForTest } from '@/lib/server/services/chat';
import { WorkspaceService, __setWorkspaceServiceForTest, __resetWorkspaceServiceForTest } from '@/lib/server/services/workspace';
import { TeamChatService, __setTeamChatServiceForTest, __resetTeamChatServiceForTest } from '@/lib/server/services/team-chat';
import { BoardService, __setBoardServiceForTest, __resetBoardServiceForTest } from '@/lib/server/services/board';
import { QuoteTemplateService, __setQuoteTemplateServiceForTest, __resetQuoteTemplateServiceForTest } from '@/lib/server/services/quote-template';
import {
  getBidQuoteTemplateRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
  getColumnRepo,
  getNotificationRepo,
  getRfpTeamMessageRepo,
  getRfpTeamMessageReadRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';

export async function setupRfpActionEnv(): Promise<PgliteDB> {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  __setNtsClientForTest(new MockNtsClient());
  __resetNtsRateLimitForTest();

  // Inject services backed by the same PGlite db so action tests pass through.
  const [
    rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo, invRepo, attRepo, bidNoteRepo, pgReqRepo, bizRepo,
    convRepo, msgRepo, userRepo, notifRepo, readRepo, requoteRepo, auditRepo, teamMsgRepo, teamReadRepo, allowedPgRepo,
    columnRepo, quoteTemplateRepo,
  ] = await Promise.all([
    getRfpRepo(), getContractRepo(), getOutboxRepo(), getWorkspaceRepo(), getBidRepo(),
    getInvitationRepo(), getAttachmentRepo(), getBidNoteRepo(), getPgRequestRepo(), getBizProfileRepo(),
    getChatConversationRepo(), getChatMessageRepo(), getUserRepo(), getNotificationRepo(), getChatReadRepo(),
    getRfpRequoteRequestRepo(), getAuditLogRepo(), getRfpTeamMessageRepo(), getRfpTeamMessageReadRepo(), getRfpAllowedPgRepo(),
    getColumnRepo(), getBidQuoteTemplateRepo(),
  ]);
  __setRfpServiceForTest(new RfpService(db, rfpRepo, contractRepo, outboxRepo, wsRepo, bidRepo, invRepo, pgReqRepo, bizRepo, requoteRepo, auditRepo, allowedPgRepo, attRepo));
  __setBidServiceForTest(
    new BidService(db, bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo),
  );
  __setChatServiceForTest(
    new ChatService(db, convRepo, wsRepo, userRepo, attRepo, msgRepo, notifRepo, readRepo, rfpRepo, invRepo),
  );
  __setWorkspaceServiceForTest(new WorkspaceService(db, outboxRepo, auditRepo, wsRepo, userRepo));
  __setTeamChatServiceForTest(new TeamChatService(db, rfpRepo, invRepo, userRepo, teamMsgRepo, teamReadRepo, wsRepo, notifRepo, outboxRepo, attRepo));
  __setBoardServiceForTest(new BoardService(columnRepo, rfpRepo, invRepo));
  __setQuoteTemplateServiceForTest(new QuoteTemplateService(quoteTemplateRepo));

  return db;
}

export function teardownRfpActionEnv(): void {
  __setActionDbForTest(undefined);
  __setNtsClientForTest(undefined);
  __resetRfpServiceForTest();
  __resetBidServiceForTest();
  __resetChatServiceForTest();
  __resetWorkspaceServiceForTest();
  __resetTeamChatServiceForTest();
  __resetBoardServiceForTest();
  __resetQuoteTemplateServiceForTest();
  __resetForTest();
}
