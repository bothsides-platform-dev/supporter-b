// Repository factory — single entry point for actions/handlers.
// Decision is lazy (first call) so vitest's NODE_ENV='test' is observed even
// when this module is imported by code that runs before env stubbing.
// Cache lives on globalThis so Next dev HMR doesn't multiply instances.
import type {
  AttachmentRepo,
  BidNoteRepo,
  BidRepo,
  BizProfileRepo,
  ContractRepo,
  InvitationRepo,
  NotificationRepo,
  OutboxRepo,
  RfpRepo,
  UserRepo,
  VerificationTokenRepo,
  WorkspaceRepo,
} from './types';

type RepoBundle = {
  rfp: RfpRepo;
  invitation: InvitationRepo;
  workspace: WorkspaceRepo;
  user: UserRepo;
  bizProfile: BizProfileRepo;
  bid: BidRepo;
  bidNote: BidNoteRepo;
  notification: NotificationRepo;
  contract: ContractRepo;
  verificationToken: VerificationTokenRepo;
  attachment: AttachmentRepo;
  outbox: OutboxRepo;
  // Backend marker for tests.
  __backend: 'memory' | 'drizzle';
};

declare global {
   
  var __bidit_repos__: RepoBundle | undefined;
}

async function buildBundle(): Promise<RepoBundle> {
  // Lazy import the postgres-js client so missing DATABASE_URL doesn't crash
  // tests that inject a pglite db via __useDrizzleWithDbForTest.
  const { db } = await import('@/lib/db/client');
  const { DrizzleRfpRepository } = await import('./drizzle/rfp');
  const { DrizzleInvitationRepository } = await import('./drizzle/invitation');
  const { DrizzleWorkspaceRepository } = await import('./drizzle/workspace');
  const { DrizzleUserRepository } = await import('./drizzle/user');
  const { DrizzleBizProfileRepository } = await import('./drizzle/biz-profile');
  const { DrizzleBidRepository } = await import('./drizzle/bid');
  const { DrizzleBidNoteRepository } = await import('./drizzle/bid-note');
  const { DrizzleNotificationRepository } = await import('./drizzle/notification');
  const { DrizzleContractRepository } = await import('./drizzle/contract');
  const { DrizzleVerificationTokenRepository } = await import(
    './drizzle/verification-token'
  );
  const { DrizzleAttachmentRepository } = await import('./drizzle/attachment');
  const { DrizzleOutboxRepository } = await import('./drizzle/outbox');

  return {
    rfp: new DrizzleRfpRepository(db),
    invitation: new DrizzleInvitationRepository(db),
    workspace: new DrizzleWorkspaceRepository(db),
    user: new DrizzleUserRepository(db),
    bizProfile: new DrizzleBizProfileRepository(db),
    bid: new DrizzleBidRepository(db),
    bidNote: new DrizzleBidNoteRepository(db),
    notification: new DrizzleNotificationRepository(db),
    contract: new DrizzleContractRepository(db),
    verificationToken: new DrizzleVerificationTokenRepository(db),
    attachment: new DrizzleAttachmentRepository(db),
    outbox: new DrizzleOutboxRepository(db),
    __backend: 'drizzle',
  };
}

/** Dev HMR can keep old repo instances after new methods land — rebuild when stale. */
function isRepoBundleStale(bundle: RepoBundle): boolean {
  return typeof bundle.workspace.listForUser !== 'function';
}

async function getBundle(): Promise<RepoBundle> {
  const cached = globalThis.__bidit_repos__;
  if (!cached || isRepoBundleStale(cached)) {
    globalThis.__bidit_repos__ = await buildBundle();
  }
  return globalThis.__bidit_repos__;
}

export async function getRfpRepo(): Promise<RfpRepo> {
  return (await getBundle()).rfp;
}
export async function getInvitationRepo(): Promise<InvitationRepo> {
  return (await getBundle()).invitation;
}
export async function getWorkspaceRepo(): Promise<WorkspaceRepo> {
  return (await getBundle()).workspace;
}
export async function getUserRepo(): Promise<UserRepo> {
  return (await getBundle()).user;
}
export async function getBizProfileRepo(): Promise<BizProfileRepo> {
  return (await getBundle()).bizProfile;
}
export async function getBidRepo(): Promise<BidRepo> {
  return (await getBundle()).bid;
}
export async function getBidNoteRepo(): Promise<BidNoteRepo> {
  return (await getBundle()).bidNote;
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
  const { DrizzleRfpRepository } = await import('./drizzle/rfp');
  const { DrizzleInvitationRepository } = await import('./drizzle/invitation');
  const { DrizzleWorkspaceRepository } = await import('./drizzle/workspace');
  const { DrizzleUserRepository } = await import('./drizzle/user');
  const { DrizzleBizProfileRepository } = await import('./drizzle/biz-profile');
  const { DrizzleBidRepository } = await import('./drizzle/bid');
  const { DrizzleBidNoteRepository } = await import('./drizzle/bid-note');
  const { DrizzleNotificationRepository } = await import('./drizzle/notification');
  const { DrizzleContractRepository } = await import('./drizzle/contract');
  const { DrizzleVerificationTokenRepository } = await import(
    './drizzle/verification-token'
  );
  const { DrizzleAttachmentRepository } = await import('./drizzle/attachment');
  const { DrizzleOutboxRepository } = await import('./drizzle/outbox');
  globalThis.__bidit_repos__ = {
    rfp: new DrizzleRfpRepository(db),
    invitation: new DrizzleInvitationRepository(db),
    workspace: new DrizzleWorkspaceRepository(db),
    user: new DrizzleUserRepository(db),
    bizProfile: new DrizzleBizProfileRepository(db),
    bid: new DrizzleBidRepository(db),
    bidNote: new DrizzleBidNoteRepository(db),
    notification: new DrizzleNotificationRepository(db),
    contract: new DrizzleContractRepository(db),
    verificationToken: new DrizzleVerificationTokenRepository(db),
    attachment: new DrizzleAttachmentRepository(db),
    outbox: new DrizzleOutboxRepository(db),
    __backend: 'drizzle',
  };
}
