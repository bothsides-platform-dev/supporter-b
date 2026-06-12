// Repository factory — single entry point for actions/handlers.
// Decision is lazy (first call) so vitest's NODE_ENV='test' is observed even
// when this module is imported by code that runs before env stubbing.
// Cache lives on globalThis so Next dev HMR doesn't multiply instances.
import type {
  AttachmentRepo,
  AuditLogRepo,
  BidNoteRepo,
  BidQuoteTemplateRepo,
  BidRepo,
  BizProfileRepo,
  ChatConversationRepo,
  ChatMessageRepo,
  ChatReadRepo,
  ChatTemplateRepo,
  ColumnRepo,
  ContractRepo,
  InvitationRepo,
  NotificationRepo,
  OutboxRepo,
  PgRequestRepo,
  RfpRepo,
  RfpRequoteRequestRepo,
  RfpTeamMessageRepo,
  UserRepo,
  VerificationTokenRepo,
  WorkspaceRepo,
} from './types';

type RepoBundle = {
  rfp: RfpRepo;
  invitation: InvitationRepo;
  pgRequest: PgRequestRepo;
  workspace: WorkspaceRepo;
  user: UserRepo;
  bizProfile: BizProfileRepo;
  bid: BidRepo;
  bidNote: BidNoteRepo;
  bidQuoteTemplate: BidQuoteTemplateRepo;
  column: ColumnRepo;
  notification: NotificationRepo;
  contract: ContractRepo;
  verificationToken: VerificationTokenRepo;
  attachment: AttachmentRepo;
  outbox: OutboxRepo;
  chatTemplate: ChatTemplateRepo;
  chatConversation: ChatConversationRepo;
  chatMessage: ChatMessageRepo;
  chatRead: ChatReadRepo;
  rfpTeamMessage: RfpTeamMessageRepo;
  rfpRequoteRequest: RfpRequoteRequestRepo;
  auditLog: AuditLogRepo;
  // Backend marker for tests.
  __backend: 'memory' | 'drizzle';
  // Version for HMR stale detection — bump when adding repos/methods.
  __version: number;
};

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_repos__: RepoBundle | undefined;
}

// Bump when adding repos or interface methods — forces HMR rebuild of stale cache.
const BUNDLE_VERSION = 6;

// Single source of repo construction — used by buildBundle and __useDrizzleWithDbForTest.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createRepoBundle(db: any, backend: 'drizzle' | 'memory'): Promise<RepoBundle> {
  const { DrizzleRfpRepository } = await import('./drizzle/rfp');
  const { DrizzleInvitationRepository } = await import('./drizzle/invitation');
  const { DrizzleRfpRequestRepository } = await import('./drizzle/rfp-pg-request');
  const { DrizzleWorkspaceRepository } = await import('./drizzle/workspace');
  const { DrizzleUserRepository } = await import('./drizzle/user');
  const { DrizzleBizProfileRepository } = await import('./drizzle/biz-profile');
  const { DrizzleBidRepository } = await import('./drizzle/bid');
  const { DrizzleBidNoteRepository } = await import('./drizzle/bid-note');
  const { DrizzleBidQuoteTemplateRepository } = await import(
    './drizzle/bid-quote-template'
  );
  const { DrizzleColumnRepository } = await import('./drizzle/column');
  const { DrizzleNotificationRepository } = await import('./drizzle/notification');
  const { DrizzleContractRepository } = await import('./drizzle/contract');
  const { DrizzleVerificationTokenRepository } = await import(
    './drizzle/verification-token'
  );
  const { DrizzleAttachmentRepository } = await import('./drizzle/attachment');
  const { DrizzleOutboxRepository } = await import('./drizzle/outbox');
  const { DrizzleChatTemplateRepository } = await import('./drizzle/chat-template');
  const { DrizzleChatConversationRepository } = await import(
    './drizzle/chat-conversation'
  );
  const { DrizzleChatMessageRepository } = await import('./drizzle/chat-message');
  const { DrizzleChatReadRepository } = await import('./drizzle/chat-read');
  const { DrizzleRfpTeamMessageRepository } = await import(
    './drizzle/rfp-team-message'
  );
  const { DrizzleRfpRequoteRequestRepository } = await import('./drizzle/rfp-requote-request');
  const { DrizzleAuditLogRepository } = await import('./drizzle/audit-log');

  return {
    rfp: new DrizzleRfpRepository(db),
    invitation: new DrizzleInvitationRepository(db),
    pgRequest: new DrizzleRfpRequestRepository(db),
    workspace: new DrizzleWorkspaceRepository(db),
    user: new DrizzleUserRepository(db),
    bizProfile: new DrizzleBizProfileRepository(db),
    bid: new DrizzleBidRepository(db),
    bidNote: new DrizzleBidNoteRepository(db),
    bidQuoteTemplate: new DrizzleBidQuoteTemplateRepository(db),
    column: new DrizzleColumnRepository(db),
    notification: new DrizzleNotificationRepository(db),
    contract: new DrizzleContractRepository(db),
    verificationToken: new DrizzleVerificationTokenRepository(db),
    attachment: new DrizzleAttachmentRepository(db),
    outbox: new DrizzleOutboxRepository(db),
    chatTemplate: new DrizzleChatTemplateRepository(db),
    chatConversation: new DrizzleChatConversationRepository(db),
    chatMessage: new DrizzleChatMessageRepository(db),
    chatRead: new DrizzleChatReadRepository(db),
    rfpTeamMessage: new DrizzleRfpTeamMessageRepository(db),
    rfpRequoteRequest: new DrizzleRfpRequoteRequestRepository(db),
    auditLog: new DrizzleAuditLogRepository(db),
    __backend: backend,
    __version: BUNDLE_VERSION,
  };
}

async function buildBundle(): Promise<RepoBundle> {
  // Lazy import the postgres-js client so missing DATABASE_URL doesn't crash
  // tests that inject a pglite db via __useDrizzleWithDbForTest.
  const { db } = await import('@/lib/db/client');
  return createRepoBundle(db, 'drizzle');
}

/** Dev HMR can keep old repo instances after new methods land — rebuild when stale. */
function isRepoBundleStale(bundle: RepoBundle): boolean {
  return bundle.__version !== BUNDLE_VERSION;
}

async function getBundle(): Promise<RepoBundle> {
  const cached = globalThis.__bidit_repos__;
  if (!cached || isRepoBundleStale(cached)) {
    const bundle = await buildBundle();
    globalThis.__bidit_repos__ = bundle;
    return bundle;
  }
  return cached;
}

export async function getRfpRepo(): Promise<RfpRepo> {
  return (await getBundle()).rfp;
}
export async function getInvitationRepo(): Promise<InvitationRepo> {
  return (await getBundle()).invitation;
}
export async function getPgRequestRepo(): Promise<PgRequestRepo> {
  return (await getBundle()).pgRequest;
}
export async function getWorkspaceRepo(): Promise<WorkspaceRepo> {
  return (await getBundle()).workspace;
}
export async function getUserRepo(): Promise<UserRepo> {
  return (await getBundle()).user;
}
// Used by RfpService.createRfp (Phase 2) for biz-profile inheritance logic.
export async function getBizProfileRepo(): Promise<BizProfileRepo> {
  return (await getBundle()).bizProfile;
}
export async function getBidRepo(): Promise<BidRepo> {
  return (await getBundle()).bid;
}
export async function getBidNoteRepo(): Promise<BidNoteRepo> {
  return (await getBundle()).bidNote;
}
export async function getBidQuoteTemplateRepo(): Promise<BidQuoteTemplateRepo> {
  return (await getBundle()).bidQuoteTemplate;
}
export async function getColumnRepo(): Promise<ColumnRepo> {
  return (await getBundle()).column;
}
export async function getNotificationRepo(): Promise<NotificationRepo> {
  return (await getBundle()).notification;
}
export async function getContractRepo(): Promise<ContractRepo> {
  return (await getBundle()).contract;
}
export async function getVerificationTokenRepo(): Promise<VerificationTokenRepo> {
  return (await getBundle()).verificationToken;
}
export async function getAttachmentRepo(): Promise<AttachmentRepo> {
  return (await getBundle()).attachment;
}
export async function getOutboxRepo(): Promise<OutboxRepo> {
  return (await getBundle()).outbox;
}
export async function getChatTemplateRepo(): Promise<ChatTemplateRepo> {
  return (await getBundle()).chatTemplate;
}
export async function getChatConversationRepo(): Promise<ChatConversationRepo> {
  return (await getBundle()).chatConversation;
}
export async function getChatMessageRepo(): Promise<ChatMessageRepo> {
  return (await getBundle()).chatMessage;
}
export async function getChatReadRepo(): Promise<ChatReadRepo> {
  return (await getBundle()).chatRead;
}
export async function getRfpTeamMessageRepo(): Promise<RfpTeamMessageRepo> {
  return (await getBundle()).rfpTeamMessage;
}
export async function getRfpRequoteRequestRepo(): Promise<RfpRequoteRequestRepo> {
  return (await getBundle()).rfpRequoteRequest;
}
export async function getAuditLogRepo(): Promise<AuditLogRepo> {
  return (await getBundle()).auditLog;
}

// For tests only — read which backend the cache settled on.
export async function __getBackend(): Promise<'memory' | 'drizzle'> {
  return (await getBundle()).__backend;
}

// For tests only — clear the cache so a different env can re-decide.
export function __resetForTest(): void {
  globalThis.__bidit_repos__ = undefined;
}

// For tests only — install Drizzle repos backed by a pglite db handle so
// action tests (Step 5+) can exercise the full repo surface (user, biz, outbox,
// verification-token, etc.) under NODE_ENV='test'. Bypasses the in-memory
// shortcut without touching factory selection logic. Pair with __resetForTest
// in afterEach.
export async function __useDrizzleWithDbForTest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<void> {
  globalThis.__bidit_repos__ = await createRepoBundle(db, 'drizzle');
}
