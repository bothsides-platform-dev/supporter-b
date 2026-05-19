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

function shouldUseInMemory(): boolean {
  // Single source of truth — if either condition holds, use in-memory.
  return (
    process.env.NODE_ENV === 'test' || process.env.REPO_BACKEND === 'memory'
  );
}

async function buildBundle(): Promise<RepoBundle> {
  if (shouldUseInMemory()) {
    const { InMemoryRfpRepository } = await import('./in-memory/rfp');
    const { InMemoryInvitationRepository } = await import('./in-memory/invitation');
    const { InMemoryWorkspaceRepository } = await import('./in-memory/workspace');
    const { InMemoryOutboxRepository } = await import('./in-memory/outbox');
    const rfp = new InMemoryRfpRepository();
    const invitation = new InMemoryInvitationRepository();
    invitation.setRfpRepoRef(() => rfp);
    const workspace = new InMemoryWorkspaceRepository();
    const outbox = new InMemoryOutboxRepository();
    // The 7 still-forward-declared repos return a Proxy that throws on any
    // method call. Construction stays cheap; the gap surfaces loudly only
    // if Step 5+ code reaches for a not-yet-implemented in-memory repo.
    const notImplemented = (name: string) =>
      new Proxy(
        {},
        {
          get() {
            throw new Error(
              `${name} not implemented for in-memory backend (Step 4). Set REPO_BACKEND=drizzle or implement in lib/server/repositories/in-memory/${name}.ts.`,
            );
          },
        },
      );
    return {
      rfp,
      invitation,
      workspace,
      user: notImplemented('user') as UserRepo,
      bizProfile: notImplemented('bizProfile') as BizProfileRepo,
      bid: notImplemented('bid') as BidRepo,
      bidNote: notImplemented('bidNote') as BidNoteRepo,
      notification: notImplemented('notification') as NotificationRepo,
      contract: notImplemented('contract') as ContractRepo,
      verificationToken: notImplemented(
        'verificationToken',
      ) as VerificationTokenRepo,
      attachment: notImplemented('attachment') as AttachmentRepo,
      outbox,
      __backend: 'memory',
    };
  }

  // Lazy import the postgres-js client so missing DATABASE_URL doesn't crash
  // tests that only exercise the in-memory branch.
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

async function getBundle(): Promise<RepoBundle> {
  if (!globalThis.__bidit_repos__) {
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
