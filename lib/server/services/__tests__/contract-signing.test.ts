import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { appOrigins } from '@/lib/site-routing';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAuditLogRepo,
  getBidRepo,
  getRfpRepo,
  getSigningContractRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  auditLogs,
  bids,
  notifications,
  rfpInvitations,
  rfps,
  signingContracts,
} from '@/lib/db/schema';
import type {
  SnowSignClient,
  SnowSignContractDetail,
} from '@/lib/server/signing/snowsign-client';
import { SnowSignError } from '@/lib/server/signing/snowsign-client';
import { logger } from '@/lib/observability/logger';
import { ContractSigningService } from '../contract-signing';

// O2: 저빈도 실패 사이트가 Sentry 헬퍼를 호출하는지 검증용 — 실 캡처는 no-op 스파이로 대체.
const { captureSigningError } = vi.hoisted(() => ({ captureSigningError: vi.fn() }));
vi.mock('@/lib/server/signing/observability', () => ({ captureSigningError }));

let db: PgliteDB;

function mockClient(overrides: Partial<SnowSignClient> = {}): SnowSignClient {
  return {
    createEmbedSession: vi.fn(),
    listContracts: vi.fn(async () => []),
    getContract: vi.fn(),
    getStatus: vi.fn(),
    downloadUrl: vi.fn(),
    auditCertificateUrl: vi.fn(),
    remind: vi.fn(),
    cancel: vi.fn(),
    // `as SnowSignClient` 캐스팅을 쓰지 않는다 — 인터페이스에 메서드가 늘었는데
    // 이 fake 가 빠뜨리면 컴파일 에러로 잡혀야 한다(캐스팅은 런타임 undefined 로 미룬다).
    ...overrides,
  };
}

async function buildService(client: SnowSignClient): Promise<ContractSigningService> {
  const [signingRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo] =
    await Promise.all([
      getSigningContractRepo(),
      getRfpRepo(),
      getBidRepo(),
      getUserRepo(),
      getWorkspaceRepo(),
      getAuditLogRepo(),
    ]);
  return new ContractSigningService(
    db,
    signingRepo,
    rfpRepo,
    bidRepo,
    userRepo,
    wsRepo,
    auditRepo,
    client,
  );
}

type Env = {
  buyerId: string;
  buyerWsId: string;
  pgUserId: string;
  pgWsId: string;
  rfpId: string;
  rfpCode: string;
  bidId: string;
};

async function seedAwarded(opts: {
  buyerPhone?: string | null;
  pgPhone?: string | null;
} = {}): Promise<Env> {
  const buyer = await seedUser(db, {
    email: `buyer-${randomUUID().slice(0, 6)}@x.com`,
    name: '구매담당',
    ...(opts.buyerPhone === undefined ? { phone: '010-1111-2222' } : opts.buyerPhone ? { phone: opts.buyerPhone } : {}),
  });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgUser = await seedUser(db, {
    email: `pg-${randomUUID().slice(0, 6)}@x.com`,
    name: 'PG담당',
    ...(opts.pgPhone === undefined ? { phone: '010-3333-4444' } : opts.pgPhone ? { phone: opts.pgPhone } : {}),
  });
  const pgWs = await seedPgWorkspace(db, `pg-${randomUUID().slice(0, 6)}.io`);
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: `P-2607-${Math.floor(1000 + Math.random() * 8999)}` });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
  });
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+2',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    status: 'submitted',
    submittedBy: pgUser.id,
    submittedAt: new Date(),
  });
  await db.update(rfps).set({ status: 'awarded', awardedBidId: bidId }).where(eq(rfps.id, rfp.id));

  return {
    buyerId: buyer.id,
    buyerWsId: buyerWs.id,
    pgUserId: pgUser.id,
    pgWsId: pgWs.id,
    rfpId: rfp.id,
    rfpCode: rfp.code,
    bidId,
  };
}

/**
 * 선정 → PG 가 임베드에서 계약서를 올려 발송, 즉 `sent` 계약이 있는 상태까지 진행한다.
 * 발송은 선정에 딸려오지 않으므로 sent 를 전제하는 테스트는 이 헬퍼를 쓴다.
 *
 * 호출자가 client 를 넘겨야 한다 — attach 가 getContract 로 재조회해 검증하기 때문에
 * 그 응답을 여기서 심어 준다. 심지 않으면 attach 가 조용히 실패하고, 그걸 전제로 쓴
 * 단언이 거짓 위에 서게 되므로 아래 expect 로 크게 실패시킨다.
 */
async function startSigning(
  service: ContractSigningService,
  env: Env,
  client: SnowSignClient,
  providerRef = 'ct_started',
): Promise<void> {
  await service.onAward(env.rfpId, env.bidId, {
    userId: env.buyerId,
    workspaceId: env.buyerWsId,
  });
  const scId = await activeContractId(env.rfpId);
  const buyer = await (await getUserRepo()).findContactById(env.buyerId);
  const pg = await (await getUserRepo()).findContactById(env.pgUserId);
  client.getContract = vi.fn(async () => ({
    contractId: providerRef,
    status: 'pending',
    externalId: `sc:${scId}`,
    participants: [
      { name: '구매담당', email: buyer!.email, status: 'pending' },
      { name: 'PG담당', email: pg!.email, status: 'pending' },
    ],
  }));
  const sent = await service.attachProviderContract(env.rfpId, providerRef, {
    userId: env.pgUserId,
    workspaceId: env.pgWsId,
  });
  expect(sent.ok, 'startSigning: attach 가 실패하면 이후 단언이 거짓 위에 선다').toBe(true);
}

beforeEach(async () => {
  __resetForTest();
  captureSigningError.mockClear();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => __resetForTest());

describe('ContractSigningService.onAward', () => {
  // 선정은 절대 자동 발송하지 않는다 — 계약서는 PG 가 딜룸 임베드에서 직접 올려 보낸다.
  it('always parks in awaiting_pg_template — never auto-sends', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();

    const r = await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.status).toBe('awaiting_pg_template');
    expect(active?.providerRef).toBeUndefined();
  });

  it('parks and notifies the PG that a contract is due', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();

    const r = await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.status).toBe('awaiting_pg_template');

    const pgNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, env.pgWsId));
    expect(pgNotifs.length).toBeGreaterThan(0);
  });

  it('is idempotent — a second onAward is a no-op', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();
    const actor = { userId: env.buyerId, workspaceId: env.buyerWsId };

    await service.onAward(env.rfpId, env.bidId, actor);
    const second = await service.onAward(env.rfpId, env.bidId, actor);
    expect(second.ok).toBe(true);

    const signingRepo = await getSigningContractRepo();
    expect(await signingRepo.findByRfp(env.rfpId)).toHaveLength(1);
  });

  it('rejects a non-awarded RFP and a foreign buyer workspace', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();

    const foreign = await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: randomUUID(),
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error).toBe('FORBIDDEN');

    await db.update(rfps).set({ status: 'sent', awardedBidId: null }).where(eq(rfps.id, env.rfpId));
    const notAwarded = await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(notAwarded.ok).toBe(false);
  });

});


describe('ContractSigningService.reconcileStatus', () => {
  const detail = (status: string, parts: SnowSignContractDetail['participants']): SnowSignContractDetail => ({
    contractId: 'ct_1',
    status,
    participants: parts,
  });

  it('applies participant-level status and moves to in_progress', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(active!.id))!.participants.find((p) => p.role === 'buyer')!.email;

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('in_progress', [
        { name: '구매담당', email: buyerEmail, status: 'signed', signedAt: '2026-02-01T00:00:00Z' },
      ]),
    );

    const r = await service.reconcileStatus(active!.id);
    expect(r.ok).toBe(true);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('in_progress');
    expect(after!.contract.lastPolledAt).toBeTruthy();
    expect(after!.participants.find((p) => p.role === 'buyer')?.status).toBe('signed');
  });

  it('finalizes (idempotently) when the provider reports completed', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('completed', []));

    await service.reconcileStatus(active!.id);
    await service.reconcileStatus(active!.id); // idempotent second poll

    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('completed');
    expect(after!.contract.completedAt).toBeTruthy();
    const done = await db.select().from(auditLogs).where(eq(auditLogs.action, 'signing.completed'));
    expect(done.length).toBe(1); // finalize audited exactly once
  });

  it('normalizes provider status casing/whitespace (" COMPLETED " → finalizes)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail(' COMPLETED ', []));

    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('completed');
  });

  it('logs an observability warning for an unrecognized (non-noop) provider status, without corrupting state', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('some_new_status', []));
    const warnSpy = vi.spyOn(logger, 'warn');

    await service.reconcileStatus(active!.id);

    // 없는 전이를 발명하지 않고 보존적으로 유지(여전히 폴 대상) + 관측 경고.
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('sent');
    expect(warnSpy).toHaveBeenCalledWith(
      'signing.unknown_provider_status',
      expect.objectContaining({ status: 'some_new_status' }),
    );
    warnSpy.mockRestore();
  });

  // ── 참여자 상태 역행 방지 (B8) ────────────────────────────────────────────
  async function reconcileFixture() {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = (await signingRepo.findActiveByRfp(env.rfpId))!;
    const buyerEmail = (await signingRepo.findById(active.id))!.participants.find(
      (p) => p.role === 'buyer',
    )!.email;
    const gc = client.getContract as ReturnType<typeof vi.fn>;
    const buyerStatus = async () =>
      (await signingRepo.findById(active.id))!.participants.find((p) => p.role === 'buyer')?.status;
    return { service, active, buyerEmail, gc, buyerStatus };
  }

  it('does not regress a signed participant back to pending on a later snapshot', async () => {
    const { service, active, buyerEmail, gc, buyerStatus } = await reconcileFixture();
    gc.mockResolvedValue(detail('in_progress', [{ name: '구매담당', email: buyerEmail, status: 'signed', signedAt: '2026-02-01T00:00:00Z' }]));
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('signed');

    gc.mockResolvedValue(detail('in_progress', [{ name: '구매담당', email: buyerEmail, status: 'pending' }]));
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('signed'); // 역행 차단
  });

  it('does not regress a viewed participant back to pending', async () => {
    const { service, active, buyerEmail, gc, buyerStatus } = await reconcileFixture();
    gc.mockResolvedValue(detail('in_progress', [{ name: '구매담당', email: buyerEmail, status: 'viewed' }]));
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('viewed');

    gc.mockResolvedValue(detail('in_progress', [{ name: '구매담당', email: buyerEmail, status: 'pending' }]));
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('viewed');
  });

  it('ignores an unknown participant status instead of forcing pending', async () => {
    const { service, active, buyerEmail, gc, buyerStatus } = await reconcileFixture();
    gc.mockResolvedValue(detail('in_progress', [{ name: '구매담당', email: buyerEmail, status: 'signed', signedAt: '2026-02-01T00:00:00Z' }]));
    await service.reconcileStatus(active.id);

    gc.mockResolvedValue(detail('in_progress', [{ name: '구매담당', email: buyerEmail, status: 'weird_new_state' }]));
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('signed');
  });

  // ── 완료 알림 유실 방지 (B7) ──────────────────────────────────────────────
  it('folds finalize into the notify tx — a notify/audit failure rolls back and retries (no lost completion)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const auditRepo = await getAuditLogRepo(); // 서비스가 캡처하는 것과 동일 인스턴스(캐시)
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = (await signingRepo.findActiveByRfp(env.rfpId))!;
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('completed', []));

    // 완료 finalize 의 audit insert 를 1회 실패시킨다(알림/감사 tx 영속 실패 시뮬레이션).
    const insertSpy = vi
      .spyOn(auditRepo, 'insert')
      .mockImplementationOnce(async () => {
        throw new Error('db blip');
      });

    // 1차: tx 롤백 → 아직 completed 아님 + 완료 알림 0.
    await service.reconcileStatus(active.id).catch(() => {});
    const mid = await signingRepo.findById(active.id);
    expect(mid!.contract.status).not.toBe('completed');
    const notifsMid = await db.select().from(notifications).where(eq(notifications.type, 'signing.completed'));
    expect(notifsMid.length).toBe(0);

    // 2차: 정상 → completed + 완료 알림 발생(정확히 1회 finalize).
    await service.reconcileStatus(active.id);
    const done = await signingRepo.findById(active.id);
    expect(done!.contract.status).toBe('completed');
    const notifsDone = await db.select().from(notifications).where(eq(notifications.type, 'signing.completed'));
    expect(notifsDone.length).toBeGreaterThan(0);
    insertSpy.mockRestore();
  });
});

describe('ContractSigningService.reconcileByProviderRef (webhook trigger)', () => {
  it('reconciles the local contract identified by its SnowSign provider ref', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.providerRef).toBe('ct_started');

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_1',
      status: 'completed',
      participants: [],
    });

    const r = await service.reconcileByProviderRef('ct_started');
    expect(r.ok).toBe(true);
    expect(client.getContract).toHaveBeenCalledWith('ct_started');

    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('completed');
  });

  it('is a no-op ack for an unknown provider ref (never throws, no provider call)', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const r = await service.reconcileByProviderRef('ct_unknown');
    expect(r.ok).toBe(true);
    expect(client.getContract).not.toHaveBeenCalled();
  });
});


describe('ContractSigningService.cancel / remind / getForActor / resend', () => {
  async function sentContract(client: SnowSignClient) {
    const service = await buildService(client);
    const env = await seedAwarded();
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    return { service, env, signingRepo, contractId: active!.id };
  }

  it('cancel propagates to SnowSign and marks the contract canceled', async () => {
    const client = mockClient();
    const { service, env, signingRepo, contractId } = await sentContract(client);

    const r = await service.cancel(contractId, { userId: env.buyerId, workspaceId: env.buyerWsId }, '재작성');
    expect(r.ok).toBe(true);
    expect(client.cancel).toHaveBeenCalledWith('ct_started', '재작성');
    const after = await signingRepo.findById(contractId);
    expect(after?.contract.status).toBe('canceled');
    expect(after?.contract.cancelReason).toBe('재작성');
  });

  it('cancel rejects a foreign workspace', async () => {
    const client = mockClient();
    const { service, contractId } = await sentContract(client);
    const r = await service.cancel(contractId, { userId: randomUUID(), workspaceId: randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(client.cancel).not.toHaveBeenCalled();
  });

  it('remind calls SnowSign remind for an authorized party', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);
    const r = await service.remind(contractId, { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(r.ok).toBe(true);
    expect(client.remind).toHaveBeenCalledWith('ct_started');
  });

  // 봉인 경계의 소유자는 서비스다 — 로더뿐 아니라 이 경로로 나가도 벗겨져야 한다.
  it('getForActor strips provider identifiers for the buyer but not for the PG', async () => {
    const client = mockClient();
    const { service, env } = await sentContract(client);

    const asBuyer = await service.getForActor(env.rfpId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(asBuyer.ok).toBe(true);
    if (asBuyer.ok) {
      expect(asBuyer.contract.snowsignTemplateId).toBeUndefined();
      expect(asBuyer.contract.providerRef).toBeUndefined();
      expect(asBuyer.contract.status).toBe('sent'); // 나머지 필드는 그대로
    }

    const asPg = await service.getForActor(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(asPg.ok).toBe(true);
    if (asPg.ok) {
      // 건별 임베드 발송은 템플릿을 안 쓰므로 snowsignTemplateId 는 비어 있다(이력 컬럼).
      // 벗겨지는지 확인할 값은 providerRef 다.
      expect(asPg.contract.providerRef).toBe('ct_started');
    }
  });

  it('getForActor returns the contract for both parties, denies others', async () => {
    const client = mockClient();
    const { service, env } = await sentContract(client);
    const asBuyer = await service.getForActor(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(asBuyer.ok).toBe(true);
    if (asBuyer.ok) expect(asBuyer.contract.status).toBe('sent');
    const asPg = await service.getForActor(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(asPg.ok).toBe(true);
    const asStranger = await service.getForActor(env.rfpId, { userId: randomUUID(), workspaceId: randomUUID() });
    expect(asStranger.ok).toBe(false);
  });

  // 재발송은 직전에 실제로 쓴 계약서를 그대로 다시 보낸다 — 구매사도 누를 수 있으므로
  // 재선택을 요구하지 않는다(구매사는 PG 계약서를 고를 수 없다).
  // 재사용 템플릿이 없어졌으므로 resend 는 **항상** 대기 라운드로 되돌린다 —
  // 계약서 PDF·서명칸은 스노우싸인 안에만 있고 우리는 사본이 없다.
  it('resend always opens a new awaiting round — nothing is sent', async () => {
    const client = mockClient();
    const { service, env, signingRepo } = await sentContract(client);

    const r = await service.resend(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);
    // 아무것도 안 보냈으므로 호출자가 '다시 보냈어요' 라고 말하지 않도록 표시한다.
    if (r.ok) expect(r.degraded).toBe(true);

    const all = await signingRepo.findByRfp(env.rfpId);
    expect(all).toHaveLength(2);
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.round).toBe(2);
    expect(active?.status).toBe('awaiting_pg_template');
    expect(active?.providerRef).toBeUndefined();
  });

  it('resend cancels the live provider contract before parking the new round', async () => {
    const client = mockClient();
    const { service, env } = await sentContract(client);

    await service.resend(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId });
    // 직전 라운드의 살아있는 계약을 취소하지 않으면 서명 링크가 두 벌 돌아다닌다.
    expect(client.cancel).toHaveBeenCalledWith('ct_started', '재발송');
  });

});



describe('ContractSigningService — polling', () => {
  const benign = (status = 'sent') =>
    ({ contractId: 'ct_1', status, participants: [] }) as SnowSignContractDetail;

  it('pollPending reconciles only sent/in_progress contracts', async () => {
    const client = mockClient({ getContract: vi.fn(async () => benign('sent')) });
    const service = await buildService(client);
    const a = await seedAwarded();
    const b = await seedAwarded();
    await startSigning(service, a, client, 'ct_a');
    await startSigning(service, b, client, 'ct_b');
    // startSigning 의 attach 가 getContract 를 쓰므로, 폴링분만 세도록 새로 심는다.
    client.getContract = vi.fn(async () => benign('sent'));

    const r = await service.pollPending(50);
    expect(r.polled).toBe(2);
    expect(client.getContract).toHaveBeenCalledTimes(2);
  });

  it('pollPending isolates a throwing contract and advances its lastPolledAt (no batch abort / starvation)', async () => {
    const client = mockClient({ getContract: vi.fn(async () => benign('sent')) });
    const service = await buildService(client);
    const a = await seedAwarded();
    const b = await seedAwarded();
    await startSigning(service, a, client, 'ct_a');
    await startSigning(service, b, client, 'ct_b');
    const signingRepo = await getSigningContractRepo();
    const ac = await signingRepo.findActiveByRfp(a.rfpId);
    const bc = await signingRepo.findActiveByRfp(b.rfpId);

    // A 의 reconcile 이 예기치 않게 throw(예: 향후 비정상값이 tx 안에서 TypeError) — B 는 정상.
    const spy = vi
      .spyOn(service, 'reconcileStatus')
      .mockImplementation(async (id: string) =>
        id === ac!.id ? Promise.reject(new Error('boom')) : { ok: true },
      );

    const r = await service.pollPending(50); // 던지지 않아야 한다
    expect(r.polled).toBe(2); // A 가 실패해도 B 까지 시도
    expect(spy).toHaveBeenCalledWith(bc!.id); // B 가 배치에서 스킵되지 않음

    // A 의 lastPolledAt 전진(큐 선두 고착=starvation 방지). findPollable 는 asc nulls first
    // 이므로 실패해도 마커를 갱신해야 다음 주기에 큐 뒤로 밀린다.
    const afterA = await signingRepo.findById(ac!.id);
    expect(afterA!.contract.lastPolledAt).toBeTruthy();
  });

  it('reconcileIfStale skips a freshly polled contract and runs an old one', async () => {
    const client = mockClient({ getContract: vi.fn(async () => benign('sent')) });
    const service = await buildService(client);
    const env = await seedAwarded();
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    // startSigning 의 attach 가 getContract 를 쓰므로 폴링분만 세도록 새로 심는다.
    client.getContract = vi.fn(async () => benign('sent'));

    // fresh (just polled) → skip
    await signingRepo.patchContract(active!.id, { lastPolledAt: new Date().toISOString() });
    await service.reconcileIfStale(active!.id, 60_000);
    expect(client.getContract).not.toHaveBeenCalled();

    // stale → run
    await signingRepo.patchContract(active!.id, {
      lastPolledAt: new Date(Date.now() - 120_000).toISOString(),
    });
    await service.reconcileIfStale(active!.id, 60_000);
    expect(client.getContract).toHaveBeenCalledTimes(1);
  });
});

describe('ContractSigningService.getDownloadUrl', () => {
  async function completed(client: SnowSignClient) {
    const service = await buildService(client);
    const env = await seedAwarded();
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    await signingRepo.patchContract(active!.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    return { service, env, contractId: active!.id };
  }

  it('returns the SnowSign document URL for an authorized party', async () => {
    const client = mockClient({
      downloadUrl: vi.fn(async () => ({ downloadUrl: 'https://s3/x.pdf', filename: 'c.pdf' })),
    });
    const { service, env, contractId } = await completed(client);
    const r = await service.getDownloadUrl(contractId, 'document', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('https://s3/x.pdf');
  });

  it('uses the audit-certificate endpoint for kind=audit', async () => {
    const client = mockClient({
      auditCertificateUrl: vi.fn(async () => ({ downloadUrl: 'https://s3/audit.pdf' })),
    });
    const { service, env, contractId } = await completed(client);
    const r = await service.getDownloadUrl(contractId, 'audit', {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('https://s3/audit.pdf');
    expect(client.auditCertificateUrl).toHaveBeenCalled();
  });

  it('denies a foreign workspace and a non-completed contract', async () => {
    const client = mockClient({
      downloadUrl: vi.fn(async () => ({ downloadUrl: 'https://s3/x.pdf' })),
    });
    const { service, contractId } = await completed(client);
    const foreign = await service.getDownloadUrl(contractId, 'document', {
      userId: randomUUID(),
      workspaceId: randomUUID(),
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error).toBe('FORBIDDEN');

    // a sent (not completed) contract
    const env2 = await seedAwarded();
    const svc2 = await buildService(client);
    await svc2.onAward(env2.rfpId, env2.bidId, { userId: env2.buyerId, workspaceId: env2.buyerWsId });
    const signingRepo = await getSigningContractRepo();
    const sent = await signingRepo.findActiveByRfp(env2.rfpId);
    const notDone = await svc2.getDownloadUrl(sent!.id, 'document', {
      userId: env2.buyerId,
      workspaceId: env2.buyerWsId,
    });
    expect(notDone.ok).toBe(false);
    if (!notDone.ok) expect(notDone.error).toBe('NOT_COMPLETED');
  });
});


describe('ContractSigningService — review hardening', () => {
  it('getForActor denies a non-party with FORBIDDEN even when no contract exists (no award-existence oracle)', async () => {
    const env = await seedAwarded();
    const service = await buildService(mockClient());
    // No onAward — no signing contract for this RFP. A non-party must not be able
    // to distinguish "no contract" (404) from "forbidden".
    const stranger = { userId: randomUUID(), workspaceId: randomUUID() };
    const r = await service.getForActor(env.rfpId, stranger);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('reconcile mirrors a participant even when the provider echoes a different-case email', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(active!.id))!.participants.find((p) => p.role === 'buyer')!.email;
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_1', status: 'in_progress',
      participants: [{ name: '구매담당', email: buyerEmail.toUpperCase(), status: 'signed', signedAt: '2026-02-01T00:00:00Z' }],
    });
    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(after!.participants.find((p) => p.role === 'buyer')?.status).toBe('signed');
  });

  it('reconcile transitions to declined and notifies both parties (idempotent on repeat)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({ contractId: 'ct_1', status: 'rejected', participants: [] });

    await service.reconcileStatus(active!.id);
    expect((await signingRepo.findById(active!.id))!.contract.status).toBe('declined');
    const first = await db.select().from(notifications).where(eq(notifications.type, 'signing.declined'));
    expect(first.length).toBeGreaterThan(0);
    await service.reconcileStatus(active!.id); // repeat poll — must not re-notify
    const second = await db.select().from(notifications).where(eq(notifications.type, 'signing.declined'));
    expect(second.length).toBe(first.length);
  });

  it('reconcile mirrors a provider-side cancellation to local canceled (stops polling)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_1',
      status: 'cancelled',
      participants: [],
    });
    await service.reconcileStatus(active!.id);
    expect((await signingRepo.findById(active!.id))!.contract.status).toBe('canceled');
    // canceled is terminal → no longer pollable
    expect(await signingRepo.findPollable(10)).toHaveLength(0);
  });

  it('reconcile swallows a provider error, bumps lastPolledAt, and keeps status', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockRejectedValue(new SnowSignError('SNOWSIGN_NETWORK'));
    const r = await service.reconcileStatus(active!.id);
    expect(r.ok).toBe(true);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('sent');
    expect(after!.contract.lastPolledAt).toBeTruthy();
  });

  it('cancel does not clobber a contract that completes mid-cancel (atomic claim, no flip-flop)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    // A completion webhook lands DURING the cancel's SnowSign round-trip.
    (client.cancel as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
        contractId: 'ct_1',
        status: 'completed',
        participants: [],
      });
      await service.reconcileStatus(active!.id);
    });
    await service.cancel(active!.id, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const status = (await signingRepo.findById(active!.id))!.contract.status;
    const completed = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.completed'));
    // Exactly one terminal outcome — cancel claimed first atomically, so the mid-cancel
    // completion is a no-op. No completed→canceled flip-flop, no duplicate terminal notify.
    expect(status).toBe('canceled');
    expect(completed.length).toBe(0);
  });

  it('nudgeStaleAwaiting re-notifies the PG for a stuck awaiting contract and throttles repeats', async () => {
    const env = await seedAwarded();
    const service = await buildService(mockClient());
    // 발송하지 않는다 — 이 테스트의 대상은 '보내지 않고 방치된' awaiting 계약이다.
    await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.status).toBe('awaiting_pg_template');
    // Backdate so it counts as "stuck", and clear the nudge marker.
    await db
      .update(signingContracts)
      .set({ createdAt: new Date('2026-01-01T00:00:00Z'), lastPolledAt: null })
      .where(eq(signingContracts.id, active!.id));

    const before = (
      await db.select().from(notifications).where(eq(notifications.type, 'signing.awaiting_template'))
    ).length;
    const r = await service.nudgeStaleAwaiting();
    expect(r.nudged).toBe(1);
    const after = (
      await db.select().from(notifications).where(eq(notifications.type, 'signing.awaiting_template'))
    ).length;
    expect(after).toBeGreaterThan(before);

    // Throttled: an immediate second run re-nudges nothing (lastPolledAt just bumped).
    expect((await service.nudgeStaleAwaiting()).nudged).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 건별 임베드 발송 — PG 가 딜룸에서 자사 계약서를 직접 올려 보낸다.
//
// 템플릿 경로와 결정적으로 다른 점: 계약을 **브라우저 안에서** 스노우싸인이 만든다.
// 서버는 contract_id 를 동기적으로 받지 못하고, 사후에 그 계약이 정말 우리 것인지
// 재조회로 검증해 바인딩한다. postMessage 는 신뢰 경계가 아니다.
// ═══════════════════════════════════════════════════════════════════════════

/** 임베드가 만든 스노우싸인 계약 상세(우리 external_id 를 되돌려주는 정상 케이스). */
function embedCreated(
  signingContractId: string,
  participants: SnowSignContractDetail['participants'],
  overrides: Partial<SnowSignContractDetail> = {},
): SnowSignContractDetail {
  return {
    contractId: 'ct_embed',
    title: '가맹 계약서',
    status: 'pending',
    externalId: `sc:${signingContractId}`,
    participants,
    ...overrides,
  };
}

async function activeContractId(rfpId: string): Promise<string> {
  const repo = await getSigningContractRepo();
  const active = await repo.findActiveByRfp(rfpId);
  expect(active, 'awaiting 계약이 있어야 한다').toBeDefined();
  return active!.id;
}

describe('ContractSigningService.createSendEmbedSession', () => {
  it('issues a pdf_send embed scoped to this signing contract', async () => {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({ sessionId: 's1', iframeUrl: 'https://app.snowsign.example/embed/x' })),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toMatchObject({ ok: true, iframeUrl: 'https://app.snowsign.example/embed/x' });

    const arg = (client.createEmbedSession as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      flows: string[];
      externalId: string;
      purpose: string;
      allowedOrigins: string[];
    };
    expect(arg.flows).toEqual(['pdf_send']);
    // 임베드를 띄울 수 있는 오리진 경계. 넓히면(예: '*') 아무 사이트나 임베드를
    // 프레임해 postMessage 를 보낼 수 있게 되므로 파트너 오리진 하나로 고정한다.
    expect(arg.allowedOrigins).toEqual([appOrigins().pg]);
    // external_id 는 이 계약을 가리키되(소유 검증) **세션마다 유니크**해야 한다 —
    // 스노우싸인이 external_id 로 임베드 세션을 중복 방지하기 때문에(409
    // EMBED_SESSION_ALREADY_ACTIVE), 고정값이면 닫았다 다시 열 때 막힌다.
    expect(arg.externalId.startsWith(`sc:${scId}:`)).toBe(true);
    expect(arg.purpose).toBe('contract_create');
  });


  it('두 번째 세션은 다른 external_id 를 쓴다 — 재오픈이 409 로 막히지 않는다', async () => {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({ sessionId: 's', iframeUrl: 'https://app.snowsign.example/e' })),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const pgActor = { userId: env.pgUserId, workspaceId: env.pgWsId };
    const scId = await activeContractId(env.rfpId);

    const first = await service.createSendEmbedSession(env.rfpId, pgActor);
    expect(first.ok).toBe(true);
    if (first.ok) await service.releaseSendEmbedClaim(env.rfpId, first.claimedAt, pgActor);
    expect((await service.createSendEmbedSession(env.rfpId, pgActor)).ok).toBe(true);

    const calls = (client.createEmbedSession as ReturnType<typeof vi.fn>).mock.calls;
    const ids = calls.map((c) => (c[0] as { externalId: string }).externalId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) expect(id.startsWith(`sc:${scId}:`)).toBe(true);
  });

  it('세션 중복(409)은 전용 코드로 올라온다', async () => {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_EMBED_SESSION_ACTIVE', 'EMBED_SESSION_ALREADY_ACTIVE');
      }),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(
      await service.createSendEmbedSession(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'SNOWSIGN_EMBED_SESSION_ACTIVE' });
  });

  it('refuses the buyer — only the awarded PG uploads the contract', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(client.createEmbedSession).not.toHaveBeenCalled();
  });

  it('refuses a PG that did not win this RFP', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();
    const other = await seedPgWorkspace(db, `other-${randomUUID().slice(0, 6)}.io`);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: other.id,
    });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(client.createEmbedSession).not.toHaveBeenCalled();
  });

  it('refuses once the contract has left awaiting (already sent)', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    const repo = await getSigningContractRepo();
    await repo.markSentIfAwaiting(scId, { providerRef: 'ct_x', sentAt: new Date().toISOString() });

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'ALREADY_SENT' });
  });

  it('serialises concurrent openers with the send lease', async () => {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({ sessionId: 's', iframeUrl: 'https://app.snowsign.example/e' })),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    expect((await service.createSendEmbedSession(env.rfpId, actor)).ok).toBe(true);
    // 담당자 둘이 각자 임베드를 열면 계약이 두 건 만들어진다 — 리스로 막는다.
    expect(await service.createSendEmbedSession(env.rfpId, actor)).toEqual({
      ok: false,
      error: 'CONTRACT_BUSY',
    });
    expect(client.createEmbedSession).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when SnowSign fails so the PG can retry immediately', async () => {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NETWORK');
      }),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    expect(await service.createSendEmbedSession(env.rfpId, actor)).toEqual({
      ok: false,
      error: 'SNOWSIGN_NETWORK',
    });
    // 리스가 잡힌 채 남으면 5분 넘게 재시도가 막힌다.
    client.createEmbedSession = vi.fn(async () => ({ sessionId: 's2', iframeUrl: 'https://app.snowsign.example/e2' }));
    expect((await service.createSendEmbedSession(env.rfpId, actor)).ok).toBe(true);
  });

  // 오리진 해석은 리스보다 **먼저** 일어나야 한다. appOrigins() 는 호스트 설정이
  // 한쪽만 채워진 깨진 배포에서 의도적으로 throw 하는데(both-or-neither), 리스를
  // 잡은 뒤에 던지면 아무 세션도 못 만든 채 리스만 남아 PG 가 5분간 잠긴다.
  it('does not strand the lease when the host config is broken', async () => {
    const service = await buildService(
      mockClient({
        createEmbedSession: vi.fn(async () => ({
          sessionId: 's1',
          iframeUrl: 'https://app.snowsign.example/e',
        })),
      }),
    );
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    // 한쪽만 설정된 상태 = appOrigins() 가 던지는 조건.
    vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.example.com');
    vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', '');
    await expect(service.createSendEmbedSession(env.rfpId, actor)).rejects.toThrow();
    vi.unstubAllEnvs();

    // 설정을 고치면 즉시 다시 열 수 있어야 한다.
    expect((await service.createSendEmbedSession(env.rfpId, actor)).ok).toBe(true);
  });
});

describe('ContractSigningService.attachProviderContract', () => {
  async function awaitingEnv() {
    const env = await seedAwarded();
    return env;
  }

  it('refuses a contract that was drafted but never actually sent', async () => {
    // postMessage 는 신뢰 경계 밖이다. 완료 이벤트를 위조하거나 임베드가 초안 단계에서
    // 이벤트를 흘리면, 실제로는 아무에게도 안 나간 계약으로 딜룸이 '발송됨'이 되고
    // 양측에 알림까지 나간다 — 구매사는 오지 않을 서명 메일을 기다리게 된다.
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () => embedCreated(scId, [], { status: 'draft' }));

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'CONTRACT_NOT_SENT' });

    // 계약은 awaiting 에 그대로 남아 PG 가 다시 시도할 수 있어야 한다.
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.status).toBe('awaiting_pg_template');
    expect(found?.contract.providerRef).toBeFalsy();
  });

  // 담당자 둘이 각자 임베드를 끝내면 스노우싸인에 계약이 두 건 살아난다. 리스가
  // 1차 방어선이지만 만료·재취득으로 새어나올 수 있어, 바인딩 자체도 선착순이어야
  // 한다 — 두 번째가 첫 바인딩을 덮으면 우리는 실제로 발송된 계약 하나를 놓친다.
  it('refuses a second, different provider contract once one is bound', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    client.getContract = vi.fn(async () => embedCreated(scId, []));
    expect((await service.attachProviderContract(env.rfpId, 'ct_first', actor)).ok).toBe(true);

    client.getContract = vi.fn(async () => embedCreated(scId, [], { contractId: 'ct_second' }));
    expect(await service.attachProviderContract(env.rfpId, 'ct_second', actor)).toEqual({
      ok: false,
      error: 'ALREADY_SENT',
    });
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.providerRef).toBe('ct_first');
  });

  it('binds the embed-created contract, marks it sent, and mirrors the signers', async () => {
    const env = await awaitingEnv();
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    const pg = await (await getUserRepo()).findContactById(env.pgUserId);
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [
        { name: '구매담당', email: buyer!.email, status: 'pending', securityMethod: 'identity_verification' },
        { name: 'PG담당', email: pg!.email, status: 'pending' },
      ]),
    );

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.participantMismatch).toBeFalsy();

    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.status).toBe('sent');
    expect(found?.contract.providerRef).toBe('ct_embed');
    expect(found?.contract.sentAt).toBeTruthy();
    // 참여자는 우리 DB 가 아니라 스노우싸인이 실제로 계약에 넣은 사람들이 진실이다.
    expect(found?.participants.map((p) => p.email).sort()).toEqual([buyer!.email, pg!.email].sort());
    expect(found?.participants.find((p) => p.email === buyer!.email)?.role).toBe('buyer');
    expect(found?.participants.find((p) => p.email === buyer!.email)?.securityMethod).toBe('easy_cert');

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, env.rfpCode));
    expect(audits.some((a) => a.action === 'signing.sent')).toBe(true);
  });

  it('notifies both parties that signing has started', async () => {
    const env = await awaitingEnv();
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [{ name: '구매담당', email: buyer!.email, status: 'pending' }]),
    );

    await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    const rows = await db.select().from(notifications);
    expect(rows.some((n) => n.type === 'signing.sent' && n.workspaceId === env.buyerWsId)).toBe(true);
    expect(rows.some((n) => n.type === 'signing.sent' && n.workspaceId === env.pgWsId)).toBe(true);
  });

  it('refuses a contract whose external_id points at someone else (Q3=yes 소유 검증)', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () => embedCreated('some-other-signing-contract', []));

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await (await getSigningContractRepo()).findById(scId))?.contract.status).toBe(
      'awaiting_pg_template',
    );
  });


  it('nonce 가 붙은 external_id 도 소유 검증을 통과한다', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () => ({
      contractId: 'ct_embed',
      status: 'pending',
      externalId: `sc:${scId}:2f8a1c00-0000-4000-8000-000000000000`,
      participants: [],
    }));

    expect((await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    })).ok).toBe(true);
  });

  it('다른 계약의 nonce external_id 는 거부한다', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    client.getContract = vi.fn(async () => ({
      contractId: 'ct_embed',
      status: 'pending',
      externalId: 'sc:11111111-1111-4111-8111-111111111111:nonce',
      participants: [],
    }));

    expect(await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    })).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('still binds when the provider echoes no external_id (Q3=no — 검증 불가, ACL 로만 게이트)', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () => embedCreated(scId, [], { externalId: undefined }));

    expect((await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    })).ok).toBe(true);
    expect((await (await getSigningContractRepo()).findById(scId))?.contract.status).toBe('sent');
  });

  it('refuses a provider contract already bound to another signing contract', async () => {
    const env = await awaitingEnv();
    const other = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    await service.onAward(other.rfpId, other.bidId, { userId: other.buyerId, workspaceId: other.buyerWsId });
    const otherScId = await activeContractId(other.rfpId);
    // 다른 계약이 이미 이 provider 계약을 쥐고 있다.
    await (await getSigningContractRepo()).markSentIfAwaiting(otherScId, {
      providerRef: 'ct_embed',
      sentAt: new Date().toISOString(),
    });

    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () => embedCreated(scId, []));
    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'PROVIDER_CONTRACT_TAKEN' });
  });

  it('is idempotent — re-attaching the same provider contract does not duplicate signers', async () => {
    const env = await awaitingEnv();
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [{ name: '구매담당', email: buyer!.email, status: 'pending' }]),
    );
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    expect((await service.attachProviderContract(env.rfpId, 'ct_embed', actor)).ok).toBe(true);
    // 복구 경로(자동 매칭)와 postMessage 가 겹쳐 두 번 도착할 수 있다.
    expect((await service.attachProviderContract(env.rfpId, 'ct_embed', actor)).ok).toBe(true);
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.participants).toHaveLength(1);
  });

  it('flags participantMismatch when the buyer signer is not among the recipients', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    // PG 가 iframe 안에서 구매사 이메일을 직접 타이핑한다 — 오타가 여기서 드러난다.
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [{ name: '엉뚱한 사람', email: 'typo@elsewhere.com', status: 'pending' }]),
    );

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    // 이미 발송된 계약이라 막지는 않는다 — 경고하고 취소를 유도한다.
    expect(r).toMatchObject({ ok: true, participantMismatch: true });
  });

  it('matches the buyer signer case-insensitively', async () => {
    const env = await awaitingEnv();
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [{ name: '구매담당', email: buyer!.email.toUpperCase(), status: 'pending' }]),
    );

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.participantMismatch).toBeFalsy();
  });

  it('refuses the buyer', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(client.getContract).not.toHaveBeenCalled();
  });

  it('does not cancel the live provider contract when SnowSign lookup fails', async () => {
    const env = await awaitingEnv();
    const client = mockClient({
      getContract: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NETWORK');
      }),
    });
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'SNOWSIGN_NETWORK' });
    // 계약서는 이미 PG 손을 떠나 서명 요청이 나갔다 — 우리가 만든 게 아니므로
    // 보상 취소하지 않는다(템플릿 경로의 performSend 와 결정적으로 다른 점).
    expect(client.cancel).not.toHaveBeenCalled();
    expect((await (await getSigningContractRepo()).findById(scId))?.contract.status).toBe(
      'awaiting_pg_template',
    );
  });
});

// 임베드 바인딩이 실패하는 두 경로. 둘 다 **살아있는 provider 계약을 보상 취소하지
// 않는다**는 것이 이 설계의 핵심 약속이다 — 계약을 만든 건 우리가 아니라 PG 이고
// 양측에 서명 요청 메일이 이미 나갔다. 로컬 저장이 실패했다는 우리 사정으로 남의
// 계약을 죽이면 안 된다. (템플릿 시절 performSend 는 정반대로 보상 취소했다.)
// 완료 postMessage 가 유실되면 계약은 실제로 발송됐는데(양측에 서명 메일이 이미 갔다)
// 딜룸만 대기에 갇힌다. external_id 로는 못 찾지만(실측 Q3), 참여자 이메일은 회신되고
// 우리는 구매사 담당자 이메일을 안다 — 그걸 상관키로 되찾는다.
describe('ContractSigningService.recoverOrphanedSend', () => {
  async function orphanEnv() {
    const env = await seedAwarded();
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    return { ...env, buyerEmail: buyer!.email };
  }

  it('adopts the one contract whose participants include the buyer signer', async () => {
    const env = await orphanEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    client.listContracts = vi.fn(async () => [
      { contractId: 'ct_other', status: 'pending' },
      { contractId: 'ct_ours', status: 'pending' },
    ]);
    client.getContract = vi.fn(async (id: string) =>
      id === 'ct_ours'
        ? embedCreated(scId, [{ name: '구매담당', email: env.buyerEmail, status: 'pending' }], {
            contractId: 'ct_ours',
          })
        : embedCreated(scId, [{ name: '남', email: 'someone@else.example', status: 'pending' }], {
            contractId: 'ct_other',
          }),
    );

    expect(await service.recoverOrphanedSend(scId)).toEqual({ ok: true, recovered: true });
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.status).toBe('sent');
    expect(found?.contract.providerRef).toBe('ct_ours');
  });

  // 단일 org 키라 다른 테넌트 계약도 목록에 섞인다. 애매하면 붙이지 않는 게 옳다 —
  // 잘못 붙이면 남의 계약 상태와 완료본이 이 딜룸에 노출된다.
  it('abstains when two candidates match the same buyer', async () => {
    const env = await orphanEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    client.listContracts = vi.fn(async () => [
      { contractId: 'ct_1', status: 'pending' },
      { contractId: 'ct_2', status: 'pending' },
    ]);
    client.getContract = vi.fn(async (id: string) =>
      embedCreated(scId, [{ name: '구매담당', email: env.buyerEmail, status: 'pending' }], {
        contractId: id,
      }),
    );

    expect(await service.recoverOrphanedSend(scId)).toEqual({ ok: true, recovered: false });
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.status).toBe('awaiting_pg_template');
  });

  it('abstains when nothing matches', async () => {
    const env = await orphanEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    client.listContracts = vi.fn(async () => [{ contractId: 'ct_x', status: 'pending' }]);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [{ name: '남', email: 'nope@else.example', status: 'pending' }], {
        contractId: 'ct_x',
      }),
    );

    expect(await service.recoverOrphanedSend(scId)).toEqual({ ok: true, recovered: false });
  });

  // 이미 다른 계약 행이 쥔 provider 계약은 후보가 아니다(선착순 제약과 같은 규칙).
  it('skips a candidate already bound to another signing row', async () => {
    const env = await orphanEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    // 다른 딜이 ct_taken 을 이미 쥐고 있다.
    const other = await seedAwarded();
    await service.onAward(other.rfpId, other.bidId, {
      userId: other.buyerId,
      workspaceId: other.buyerWsId,
    });
    const otherId = await activeContractId(other.rfpId);
    await (await getSigningContractRepo()).markSentIfAwaiting(otherId, {
      providerRef: 'ct_taken',
      sentAt: new Date().toISOString(),
    });

    client.listContracts = vi.fn(async () => [{ contractId: 'ct_taken', status: 'pending' }]);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [{ name: '구매담당', email: env.buyerEmail, status: 'pending' }], {
        contractId: 'ct_taken',
      }),
    );

    expect(await service.recoverOrphanedSend(scId)).toEqual({ ok: true, recovered: false });
  });

  it('does nothing once the contract has left awaiting', async () => {
    const env = await orphanEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    await (await getSigningContractRepo()).markSentIfAwaiting(scId, {
      providerRef: 'ct_done',
      sentAt: new Date().toISOString(),
    });
    client.listContracts = vi.fn();

    expect(await service.recoverOrphanedSend(scId)).toEqual({ ok: true, recovered: false });
    expect(client.listContracts).not.toHaveBeenCalled();
  });
});

describe('ContractSigningService.attachProviderContract — 실패 경로는 계약을 죽이지 않는다', () => {
  /** signingRepo 의 한 메서드만 바꿔치기한 서비스를 만든다. */
  async function serviceWithPatchedRepo(
    client: SnowSignClient,
    patch: Record<string, unknown>,
  ): Promise<ContractSigningService> {
    const [signingRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo] = await Promise.all([
      getSigningContractRepo(),
      getRfpRepo(),
      getBidRepo(),
      getUserRepo(),
      getWorkspaceRepo(),
      getAuditLogRepo(),
    ]);
    const patched = Object.assign(Object.create(signingRepo) as typeof signingRepo, patch);
    return new ContractSigningService(db, patched, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo, client);
  }

  async function awaitingWithProviderContract(client: SnowSignClient) {
    const env = await seedAwarded();
    const seeder = await buildService(mockClient());
    await seeder.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [{ name: '구매담당', email: buyer!.email, status: 'pending' }]),
    );
    return { env, scId };
  }

  it('CONTRACT_CHANGED — 왕복 도중 계약이 awaiting 을 벗어나면 되감고, 계약은 살려둔다', async () => {
    const client = mockClient();
    const { env, scId } = await awaitingWithProviderContract(client);
    // 구매사 취소가 바인딩 tx 안에서 CAS 를 이긴 상황.
    const service = await serviceWithPatchedRepo(client, {
      markSentIfAwaiting: async () => false,
    });

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'CONTRACT_CHANGED' });
    expect(client.cancel).not.toHaveBeenCalled();
    // 상태는 그대로 — 되감았으므로 참여자도 남지 않는다.
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.status).toBe('awaiting_pg_template');
    expect(found?.participants).toHaveLength(0);
  });

  it('PERSIST_FAILED — 로컬 저장이 터져도 계약은 살려두고, 다시 붙일 수 있게 남긴다', async () => {
    const client = mockClient();
    const { env, scId } = await awaitingWithProviderContract(client);
    const service = await serviceWithPatchedRepo(client, {
      insertParticipants: async () => {
        throw new Error('persist boom');
      },
    });

    const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'PERSIST_FAILED' });
    expect(client.cancel).not.toHaveBeenCalled();
    // 바인딩 전 상태로 되감겨야 재시도(멱등 attach)가 성립한다.
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.status).toBe('awaiting_pg_template');
    expect(found?.contract.providerRef).toBeUndefined();
    expect(captureSigningError).toHaveBeenCalledWith(
      'signing.attach_persist_failed',
      expect.anything(),
      expect.objectContaining({ providerRef: 'ct_embed' }),
    );
  });

  it('재시도하면 붙는다 — 실패가 계약을 영구히 막지 않는다', async () => {
    const client = mockClient();
    const { env, scId } = await awaitingWithProviderContract(client);
    const failing = await serviceWithPatchedRepo(client, {
      insertParticipants: async () => {
        throw new Error('persist boom');
      },
    });
    expect((await failing.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    })).ok).toBe(false);

    // 같은 provider 계약으로 정상 서비스가 다시 시도.
    const healthy = await buildService(client);
    const r = await healthy.attachProviderContract(env.rfpId, 'ct_embed', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(true);
    const found = await (await getSigningContractRepo()).findById(scId);
    expect(found?.contract.status).toBe('sent');
    expect(found?.contract.providerRef).toBe('ct_embed');
  });
});

// 임베드 패널을 닫으면 리스를 반납한다.
//
// 리스는 담당자 둘이 동시에 임베드를 열어 계약이 두 건 나가는 것을 막으려고 있다.
// 그런데 '닫기'가 리스를 안 풀면 **방금 닫은 본인이** 리스 만료까지 자기에게 잠긴다
// (실사용에서 발견: 닫기 → 다시 계약서 올리기 → CONTRACT_BUSY 토스트).
// 닫기는 "나 이제 안 쓴다"는 뜻이므로 반납이 맞다.
describe('ContractSigningService.releaseSendEmbedClaim', () => {
  async function claimed() {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({ sessionId: 's1', iframeUrl: 'https://app.snowsign.example/e' })),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const pgActor = { userId: env.pgUserId, workspaceId: env.pgWsId };
    const opened = await service.createSendEmbedSession(env.rfpId, pgActor);
    expect(opened.ok).toBe(true);
    return { client, service, env, pgActor, claimedAt: opened.ok ? opened.claimedAt : '' };
  }

  it('닫은 뒤 바로 다시 열 수 있다 — 리스 만료를 기다리지 않는다', async () => {
    const { service, env, pgActor, claimedAt } = await claimed();
    // 반납 전에는 잠겨 있다(회귀 가드 — 리스 자체가 살아 있어야 이 테스트가 의미 있다).
    expect(await service.createSendEmbedSession(env.rfpId, pgActor)).toEqual({
      ok: false,
      error: 'CONTRACT_BUSY',
    });

    expect(await service.releaseSendEmbedClaim(env.rfpId, claimedAt, pgActor)).toEqual({ ok: true });
    expect((await service.createSendEmbedSession(env.rfpId, pgActor)).ok).toBe(true);
  });

  it('세션 발급이 리스 시각을 함께 돌려준다 — 반납의 열쇠다', async () => {
    const { claimedAt } = await claimed();
    expect(claimedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(claimedAt))).toBe(false);
  });

  it('구매사는 반납할 수 없다', async () => {
    const { service, env, claimedAt } = await claimed();
    expect(
      await service.releaseSendEmbedClaim(env.rfpId, claimedAt, {
        userId: env.buyerId,
        workspaceId: env.buyerWsId,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    // 리스는 그대로 살아 있어야 한다.
    expect(
      await service.createSendEmbedSession(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'CONTRACT_BUSY' });
  });

  // 리스가 만료돼 다른 담당자가 재취득했다면, 옛 세션의 뒤늦은 '닫기'가 남의
  // 살아있는 리스를 풀어선 안 된다. repo 의 claimedAt 정확일치 가드가 이걸 막는다.
  it('다른 시각의 리스는 풀지 않는다 (뒤늦은 닫기가 남의 클레임을 못 푼다)', async () => {
    const { service, env, pgActor } = await claimed();
    const stale = new Date(Date.now() - 60 * 60_000).toISOString();

    expect(await service.releaseSendEmbedClaim(env.rfpId, stale, pgActor)).toEqual({ ok: true });
    // 현재 리스는 멀쩡해야 한다.
    expect(await service.createSendEmbedSession(env.rfpId, pgActor)).toEqual({
      ok: false,
      error: 'CONTRACT_BUSY',
    });
  });

  it('이미 발송된 계약에는 아무 일도 하지 않는다', async () => {
    const { service, env, pgActor, claimedAt } = await claimed();
    const scId = await activeContractId(env.rfpId);
    await (await getSigningContractRepo()).markSentIfAwaiting(scId, {
      providerRef: 'ct_x',
      sentAt: new Date().toISOString(),
    });
    expect(await service.releaseSendEmbedClaim(env.rfpId, claimedAt, pgActor)).toEqual({
      ok: false,
      error: 'ALREADY_SENT',
    });
  });
});

// 하트비트 — 패널이 열려 있는 동안만 리스를 살려 둔다.
//
// 리스를 5분으로 줄이는 대신 열려 있는 동안 주기적으로 연장한다. 그러면 닫기·탭 닫기·
// 크래시·네트워크 끊김이 전부 "핑이 멎음" 하나로 수렴해 유령 리스가 최대 5분만 남는다.
describe('ContractSigningService.renewSendEmbedClaim', () => {
  async function opened() {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({ sessionId: 's1', iframeUrl: 'https://app.snowsign.example/e' })),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const pgActor = { userId: env.pgUserId, workspaceId: env.pgWsId };
    const r = await service.createSendEmbedSession(env.rfpId, pgActor);
    expect(r.ok).toBe(true);
    return { service, env, pgActor, claimedAt: r.ok ? r.claimedAt : '' };
  }

  it('연장하면 새 토큰을 돌려주고, 옛 토큰은 죽는다', async () => {
    const { service, env, pgActor, claimedAt } = await opened();

    const r = await service.renewSendEmbedClaim(env.rfpId, claimedAt, pgActor);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.claimedAt).not.toBe(claimedAt);

    // 새 토큰으로는 계속 연장되고, 옛 토큰으로는 안 된다.
    expect((await service.renewSendEmbedClaim(env.rfpId, r.claimedAt, pgActor)).ok).toBe(true);
    expect(await service.renewSendEmbedClaim(env.rfpId, claimedAt, pgActor)).toEqual({
      ok: false,
      error: 'CONTRACT_BUSY',
    });
  });

  it('연장해도 리스는 여전히 남을 막는다', async () => {
    const { service, env, pgActor, claimedAt } = await opened();
    await service.renewSendEmbedClaim(env.rfpId, claimedAt, pgActor);
    expect(await service.createSendEmbedSession(env.rfpId, pgActor)).toEqual({
      ok: false,
      error: 'CONTRACT_BUSY',
    });
  });

  it('구매사는 연장할 수 없다', async () => {
    const { service, env, claimedAt } = await opened();
    expect(
      await service.renewSendEmbedClaim(env.rfpId, claimedAt, {
        userId: env.buyerId,
        workspaceId: env.buyerWsId,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('이미 발송됐으면 연장하지 않는다 — 호출부가 하트비트를 멈춰야 한다', async () => {
    const { service, env, pgActor, claimedAt } = await opened();
    const scId = await activeContractId(env.rfpId);
    await (await getSigningContractRepo()).markSentIfAwaiting(scId, {
      providerRef: 'ct_x',
      sentAt: new Date().toISOString(),
    });
    expect(await service.renewSendEmbedClaim(env.rfpId, claimedAt, pgActor)).toEqual({
      ok: false,
      error: 'ALREADY_SENT',
    });
  });

  // 핑이 멎은 세션은 리스 만료 후 아무나 다시 잡을 수 있어야 한다. 5분을 실제로
  // 기다릴 수 없으니, 현재 리스를 풀고 '오래된' 리스를 직접 심어 만료 상태를 만든다.
  it('연장이 멎으면 리스가 만료돼 다른 담당자가 잡는다', async () => {
    const { service, env, pgActor, claimedAt } = await opened();
    const repo = await getSigningContractRepo();
    const scId = await activeContractId(env.rfpId);

    const stale = new Date(Date.now() - 60 * 60_000);
    await repo.releaseSendClaim(scId, new Date(claimedAt));
    expect(await repo.claimForSend(scId, stale, new Date(stale.getTime() - 1))).toBe(true);

    // 만료된 리스는 새 세션 발급을 막지 못한다.
    expect((await service.createSendEmbedSession(env.rfpId, pgActor)).ok).toBe(true);
  });
});
