import { getContractArchiveService } from '../contract-archive';
import { getAgreementService } from '../agreement';
import { getAgreementRepo } from '@/lib/server/repositories/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Legacy provider lifecycle remains supported; new agreement dispatch has its own suite.
vi.mock('@/lib/features/long-term-agreements', () => ({
  LONG_TERM_AGREEMENTS_ENABLED: false,
}));

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';

import type { SentContractSnapshot } from '@/lib/types/signing';
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
  signingParticipants,
} from '@/lib/db/schema';
import type {
  AuditLogRepo,
  PgSigningTemplateRepo,
} from '@/lib/server/repositories/types';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type {
  SnowSignClient,
  SnowSignContractDetail,
} from '@/lib/server/signing/snowsign-client';
import {
  SnowSignError,
  __setSnowSignClientForTest,
} from '@/lib/server/signing/snowsign-client';
import { logger } from '@/lib/observability/logger';
import { SIGNING_ROLE_LABELS } from '@/lib/signing/template-fields';
import {
  ContractSigningService,
  __resetContractSigningServiceForTest,
  getContractSigningService,
} from '../contract-signing';

// O2: 저빈도 실패 사이트가 Sentry 헬퍼를 호출하는지 검증용 — 실 캡처는 no-op 스파이로 대체.
const { captureSigningError } = vi.hoisted(() => ({
  captureSigningError: vi.fn(),
}));
vi.mock('@/lib/server/signing/observability', () => ({ captureSigningError }));

// 운영자 슬랙 알림 — no-op 스파이. 기존 테스트에는 무영향, 전이 분기에서만
// 정확히 1회 발화하는지(폴러 무발화 보장)를 아래 전용 describe 가 검증한다.
const { notifySigningOperator } = vi.hoisted(() => ({
  notifySigningOperator: vi.fn(),
}));
vi.mock('@/lib/server/notifications/operator-signing', () => ({
  notifySigningOperator,
}));

let db: PgliteDB;

function mockClient(overrides: Partial<SnowSignClient> = {}): SnowSignClient {
  return {
    createEmbedSession: vi.fn(),
    listContracts: vi.fn(async () => ({ rows: [], totalPages: 1 })),
    getContract: vi.fn(),
    getStatus: vi.fn(),
    downloadUrl: vi.fn(),
    auditCertificateUrl: vi.fn(),
    remind: vi.fn(),
    cancel: vi.fn(),
    createUploadSession: vi.fn(),
    createTemplate: vi.fn(),
    createContractFromTemplate: vi.fn(),
    createContract: vi.fn(),
    sendContract: vi.fn(),
    // 기본값은 **본인인증이 걸린** 템플릿이다 — 발송 경로가 발송 전에 이 정책을
    // 확인하므로, 기본을 미강제로 두면 모든 발송 테스트가 정책 검사에 막힌다.
    getTemplate: vi.fn(async () => ({
      templateId: 'sst_1',
      hasVariables: false,
      signatureFields: [],
      signers: [
        { roleName: SIGNING_ROLE_LABELS[0], securityMethod: 'easy_cert' },
        { roleName: SIGNING_ROLE_LABELS[1], securityMethod: 'easy_cert' },
      ],
    })),
    templateDownloadUrl: vi.fn(),
    // `as SnowSignClient` 캐스팅을 쓰지 않는다 — 인터페이스에 메서드가 늘었는데
    // 이 fake 가 빠뜨리면 컴파일 에러로 잡혀야 한다(캐스팅은 런타임 undefined 로 미룬다).
    ...overrides,
  };
}

/** 인메모리 템플릿 레포 — seed 에 없는 id 는 undefined 로 떨어진다. */
function fakeTemplateRepo(
  seed: PgSigningTemplate[] = [],
): PgSigningTemplateRepo {
  return {
    create: vi.fn(async () => {}),
    createComposed: vi.fn(async () => {}),
    findById: vi.fn(async (id: string) => seed.find((r) => r.id === id)),
    listByWorkspace: vi.fn(async (wsId: string) =>
      seed.filter((r) => r.workspaceId === wsId),
    ),
    updateName: vi.fn(async () => {}),
    updateProviderTemplate: vi.fn(async () => true),
    updateComposedDocument: vi.fn(async () => true),
    remove: vi.fn(async () => {}),
  };
}

async function buildService(
  client: SnowSignClient,
  templateRepo: PgSigningTemplateRepo = fakeTemplateRepo(),
): Promise<ContractSigningService> {
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
    templateRepo,
    await getAgreementService(),
    await getAgreementRepo(),
    async (id) =>
      (await getContractArchiveService()).createPendingForContract(id),
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

async function seedAwarded(
  opts: {
    buyerPhone?: string | null;
    pgPhone?: string | null;
    /** 같은 구매사 담당자로 두 번째 딜을 만들 때 — 한 사람이 견적을 여럿 내는 건 평범하다. */
    reuseBuyer?: { id: string; wsId: string };
    /** 같은 PG 워크스페이스가 두 딜을 다 따낸 경우 — 딜 간 경계를 시험할 때 필요하다. */
    reusePg?: { id: string; wsId: string };
  } = {},
): Promise<Env> {
  const buyer = opts.reuseBuyer
    ? { id: opts.reuseBuyer.id }
    : await seedUser(db, {
        email: `buyer-${randomUUID().slice(0, 6)}@x.com`,
        name: '구매담당',
        ...(opts.buyerPhone === undefined
          ? { phone: '010-1111-2222' }
          : opts.buyerPhone
            ? { phone: opts.buyerPhone }
            : {}),
      });
  const buyerWs = opts.reuseBuyer
    ? { id: opts.reuseBuyer.wsId }
    : await seedBuyerWorkspace(db);
  if (!opts.reuseBuyer) await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgUser = opts.reusePg
    ? { id: opts.reusePg.id }
    : await seedUser(db, {
        email: `pg-${randomUUID().slice(0, 6)}@x.com`,
        name: 'PG담당',
        ...(opts.pgPhone === undefined
          ? { phone: '010-3333-4444' }
          : opts.pgPhone
            ? { phone: opts.pgPhone }
            : {}),
      });
  const pgWs = opts.reusePg
    ? { id: opts.reusePg.wsId }
    : await seedPgWorkspace(db, `pg-${randomUUID().slice(0, 6)}.io`);
  if (!opts.reusePg) await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, {
    buyerWsId: buyerWs.id,
    createdBy: buyer.id,
    code: `P-2607-${Math.floor(1000 + Math.random() * 8999)}`,
  });
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
  await db
    .update(rfps)
    .set({ status: 'awarded', awardedBidId: bidId })
    .where(eq(rfps.id, rfp.id));

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

/** Historical rows are fixtures: reconciliation must not depend on retired dispatch. */
async function seedSentContract(
  env: Env,
  providerRef = 'ct_started',
): Promise<string> {
  const id = randomUUID();
  await db.insert(signingContracts).values({
    id,
    kind: 'pg_buyer',
    rfpId: env.rfpId,
    createdBy: env.buyerId,
    providerRef,
    status: 'sent',
    sentAt: new Date(),
  });
  const users = await getUserRepo();
  const buyer = (await users.findContactById(env.buyerId))!;
  const pg = (await users.findContactById(env.pgUserId))!;
  await db.insert(signingParticipants).values([
    {
      contractId: id,
      userId: env.buyerId,
      name: buyer.name,
      email: buyer.email,
      role: 'buyer',
      securityMethod: 'easy_cert',
    },
    {
      contractId: id,
      userId: env.pgUserId,
      name: pg.name,
      email: pg.email,
      role: 'pg',
      securityMethod: 'easy_cert',
    },
  ]);
  return id;
}

async function seedAwaitingContract(): Promise<Env & { contractId: string }> {
  const env = await seedAwarded();
  const contractId = randomUUID();
  await db.insert(signingContracts).values({
    id: contractId,
    kind: 'pg_buyer',
    rfpId: env.rfpId,
    createdBy: env.buyerId,
    status: 'awaiting_pg_template',
  });
  return { ...env, contractId };
}

beforeEach(async () => {
  __resetForTest();
  captureSigningError.mockClear();
  notifySigningOperator.mockClear();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => __resetForTest());

describe('ContractSigningService.reconcileStatus', () => {
  const detail = (
    status: string,
    parts: SnowSignContractDetail['participants'],
  ): SnowSignContractDetail => ({
    contractId: 'ct_1',
    status,
    participants: parts,
  });

  it('applies participant-level status and moves to in_progress', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(
      active!.id,
    ))!.participants.find((p) => p.role === 'buyer')!.email;

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('in_progress', [
        {
          name: '구매담당',
          email: buyerEmail,
          status: 'signed',
          signedAt: '2026-02-01T00:00:00Z',
        },
      ]),
    );

    const r = await service.reconcileStatus(active!.id);
    expect(r.ok).toBe(true);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('in_progress');
    expect(after!.contract.lastPolledAt).toBeTruthy();
    expect(after!.participants.find((p) => p.role === 'buyer')?.status).toBe(
      'signed',
    );
  });

  it('mirrors the provider expires_at onto the contract (진행 화면 마감 표시의 데이터원)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...detail('in_progress', []),
      expiresAt: '2026-09-01T00:00:00Z',
    });

    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.expiresAt).toBe('2026-09-01T00:00:00.000Z');

    // provider 가 만료를 해제하면(회신에 부재) 지운다 — 부재가 곧 '마감 없음'이다.
    // (email_delivery 의 '생략은 지움이 아니다'와 반대인 의도적 비대칭.)
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('in_progress', []),
    );
    await service.reconcileStatus(active!.id);
    expect(
      (await signingRepo.findById(active!.id))!.contract.expiresAt,
    ).toBeUndefined();
  });

  it.each([
    ['rejected', 'signing.declined'],
    ['expired', 'signing.expired'],
  ] as const)(
    '종결 전이(%s)를 감사 로그에 정확히 1회 남긴다 — 반복 폴에도 중복 없음',
    async (providerStatus, auditAction) => {
      const env = await seedAwarded();
      const client = mockClient();
      const service = await buildService(client);
      await seedSentContract(env);
      const signingRepo = await getSigningContractRepo();
      const active = await signingRepo.findActiveByRfp(env.rfpId);

      (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
        detail(providerStatus, []),
      );

      await service.reconcileStatus(active!.id);
      await service.reconcileStatus(active!.id); // 중복 폴 — CAS 진 쪽은 기록하지 않는다
      const rows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, auditAction));
      expect(rows.length).toBe(1);
    },
  );

  it('레거시 종결은 감사 실패에도 유지되지만 사용자 알림은 보내지 않는다', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    const realAudit = await getAuditLogRepo();
    const failingAudit: AuditLogRepo = {
      insert: async (entry, tx) => {
        if (entry.action === 'signing.declined') throw new Error('audit down');
        return realAudit.insert(entry, tx);
      },
      listForWorkspace: (w, o) => realAudit.listForWorkspace(w, o),
    };
    const service = new ContractSigningService(
      db,
      signingRepo,
      await getRfpRepo(),
      await getBidRepo(),
      await getUserRepo(),
      await getWorkspaceRepo(),
      failingAudit,
      client,
      fakeTemplateRepo(),
      await getAgreementService(),
      await getAgreementRepo(),
      async (id) =>
        (await getContractArchiveService()).createPendingForContract(id),
    );
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('rejected', []),
    );

    const r = await service.reconcileStatus(active!.id);
    expect(r.ok).toBe(true);
    expect((await signingRepo.findById(active!.id))!.contract.status).toBe(
      'declined',
    );
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.declined'));
    expect(notifs.length).toBe(0);
  });

  it('제공자 측 취소(cancelled)를 감사 로그에 1회 남긴다 — 앱 취소와 reason 으로 구분', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('cancelled', []),
    );

    await service.reconcileStatus(active!.id);
    await service.reconcileStatus(active!.id);
    // 앱 내 cancel() 과 다른 action — 활동 기록에서 사람이 취소한 것처럼 읽히면 안 된다.
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'signing.canceled_by_provider'));
    expect(rows.length).toBe(1);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'signing.canceled')),
    ).toHaveLength(0);
  });

  it('mirrors participant email_delivery — 반송된 수신자를 화면이 알 수 있게 남긴다', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(
      active!.id,
    ))!.participants.find((p) => p.role === 'buyer')!.email;

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('sent', [
        {
          name: '구매담당',
          email: buyerEmail,
          status: 'pending',
          emailDelivery: 'bounced',
        },
      ]),
    );

    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(
      after!.participants.find((p) => p.role === 'buyer')?.emailDelivery,
    ).toBe('bounced');
  });

  it('email_delivery 는 회복도 미러링한다 — delivered 가 bounced 를 덮고, 회신 생략 시 마지막 값이 남는다', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(
      active!.id,
    ))!.participants.find((p) => p.role === 'buyer')!.email;
    const mock = client.getContract as ReturnType<typeof vi.fn>;

    mock.mockResolvedValue(
      detail('sent', [
        {
          name: '구매담당',
          email: buyerEmail,
          status: 'pending',
          emailDelivery: 'bounced',
        },
      ]),
    );
    await service.reconcileStatus(active!.id);
    mock.mockResolvedValue(
      detail('sent', [
        {
          name: '구매담당',
          email: buyerEmail,
          status: 'pending',
          emailDelivery: 'delivered',
        },
      ]),
    );
    await service.reconcileStatus(active!.id);
    let buyer = (await signingRepo.findById(active!.id))!.participants.find(
      (p) => p.role === 'buyer',
    );
    expect(buyer?.emailDelivery).toBe('delivered'); // 회복 — 지속 경고가 걷힌다

    mock.mockResolvedValue(
      detail('sent', [
        { name: '구매담당', email: buyerEmail, status: 'pending' },
      ]),
    );
    await service.reconcileStatus(active!.id);
    buyer = (await signingRepo.findById(active!.id))!.participants.find(
      (p) => p.role === 'buyer',
    );
    expect(buyer?.emailDelivery).toBe('delivered'); // 생략은 지움이 아니다 — 마지막 값 유지
  });

  it('finalizes (idempotently) when the provider reports completed', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('completed', []),
    );

    await service.reconcileStatus(active!.id);
    await service.reconcileStatus(active!.id); // idempotent second poll

    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('completed');
    expect(after!.contract.completedAt).toBeTruthy();
    const done = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'signing.completed'));
    expect(done.length).toBe(1); // finalize audited exactly once
  });

  it('normalizes provider status casing/whitespace (" COMPLETED " → finalizes)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail(' COMPLETED ', []),
    );

    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('completed');
  });

  it('logs an observability warning for an unrecognized (non-noop) provider status, without corrupting state', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('some_new_status', []),
    );
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
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = (await signingRepo.findActiveByRfp(env.rfpId))!;
    const buyerEmail = (await signingRepo.findById(
      active.id,
    ))!.participants.find((p) => p.role === 'buyer')!.email;
    const gc = client.getContract as ReturnType<typeof vi.fn>;
    const buyerStatus = async () =>
      (await signingRepo.findById(active.id))!.participants.find(
        (p) => p.role === 'buyer',
      )?.status;
    return { service, active, buyerEmail, gc, buyerStatus };
  }

  it('does not regress a signed participant back to pending on a later snapshot', async () => {
    const { service, active, buyerEmail, gc, buyerStatus } =
      await reconcileFixture();
    gc.mockResolvedValue(
      detail('in_progress', [
        {
          name: '구매담당',
          email: buyerEmail,
          status: 'signed',
          signedAt: '2026-02-01T00:00:00Z',
        },
      ]),
    );
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('signed');

    gc.mockResolvedValue(
      detail('in_progress', [
        { name: '구매담당', email: buyerEmail, status: 'pending' },
      ]),
    );
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('signed'); // 역행 차단
  });

  it('does not regress a viewed participant back to pending', async () => {
    const { service, active, buyerEmail, gc, buyerStatus } =
      await reconcileFixture();
    gc.mockResolvedValue(
      detail('in_progress', [
        { name: '구매담당', email: buyerEmail, status: 'viewed' },
      ]),
    );
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('viewed');

    gc.mockResolvedValue(
      detail('in_progress', [
        { name: '구매담당', email: buyerEmail, status: 'pending' },
      ]),
    );
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('viewed');
  });

  it('ignores an unknown participant status instead of forcing pending', async () => {
    const { service, active, buyerEmail, gc, buyerStatus } =
      await reconcileFixture();
    gc.mockResolvedValue(
      detail('in_progress', [
        {
          name: '구매담당',
          email: buyerEmail,
          status: 'signed',
          signedAt: '2026-02-01T00:00:00Z',
        },
      ]),
    );
    await service.reconcileStatus(active.id);

    gc.mockResolvedValue(
      detail('in_progress', [
        { name: '구매담당', email: buyerEmail, status: 'weird_new_state' },
      ]),
    );
    await service.reconcileStatus(active.id);
    expect(await buyerStatus()).toBe('signed');
  });

  // ── 완료 알림 유실 방지 (B7) ──────────────────────────────────────────────
  it('folds finalize into the notify tx — a notify/audit failure rolls back and retries (no lost completion)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const auditRepo = await getAuditLogRepo(); // 서비스가 캡처하는 것과 동일 인스턴스(캐시)
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = (await signingRepo.findActiveByRfp(env.rfpId))!;
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('completed', []),
    );

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
    const notifsMid = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.completed'));
    expect(notifsMid.length).toBe(0);

    // 2차: 정상 → completed + 완료 알림 발생(정확히 1회 finalize).
    await service.reconcileStatus(active.id);
    const done = await signingRepo.findById(active.id);
    expect(done!.contract.status).toBe('completed');
    const notifsDone = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.completed'));
    expect(notifsDone.length).toBe(0);
    insertSpy.mockRestore();
  });
});

describe('ContractSigningService.reconcileByProviderRef (webhook trigger)', () => {
  it('reconciles the local contract identified by its SnowSign provider ref', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
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
    expect(client.getContract).toHaveBeenCalledWith('ct_started', {
      maxRetries: 1,
    });

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

describe('ContractSigningService — polling', () => {
  const benign = (status = 'sent') =>
    ({
      contractId: 'ct_1',
      status,
      participants: [],
    }) as SnowSignContractDetail;

  it('pollPending reconciles only sent/in_progress contracts', async () => {
    const client = mockClient({
      getContract: vi.fn(async () => benign('sent')),
    });
    const service = await buildService(client);
    const a = await seedAwarded();
    const b = await seedAwarded();
    await seedSentContract(a, 'ct_a');
    await seedSentContract(b, 'ct_b');
    // Poll only the historical rows prepared above.
    client.getContract = vi.fn(async () => benign('sent'));

    const r = await service.pollPending(50);
    expect(r.polled).toBe(2);
    expect(client.getContract).toHaveBeenCalledTimes(2);
    // 폴링은 재시도 예산 1 — 다음 틱이 만회한다. 50건 틱이 재시도 3회를 물면
    // 최악 200 요청으로 공유 한도(100/분)를 혼자 넘긴다.
    expect(client.getContract).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxRetries: 1 }),
    );
  });

  it('pollPending isolates a throwing contract and advances its lastPolledAt (no batch abort / starvation)', async () => {
    const client = mockClient({
      getContract: vi.fn(async () => benign('sent')),
    });
    const service = await buildService(client);
    const a = await seedAwarded();
    const b = await seedAwarded();
    await seedSentContract(a, 'ct_a');
    await seedSentContract(b, 'ct_b');
    const signingRepo = await getSigningContractRepo();
    const ac = await signingRepo.findActiveByRfp(a.rfpId);
    const bc = await signingRepo.findActiveByRfp(b.rfpId);

    // 저장소 실패를 주입하고 실제 폴링을 실행한다. 내부 메서드 분리와 무관하게
    // A 실패 격리·B 동기화·A 큐 마커 갱신이 함께 보장돼야 한다.
    const findById = signingRepo.findById.bind(signingRepo);
    const spy = vi
      .spyOn(signingRepo, 'findById')
      .mockImplementation(async (id, tx) => {
        if (id === ac!.id) throw new Error('boom');
        return findById(id, tx);
      });
    client.getContract = vi.fn(async () => benign('in_progress'));
    try {
      expect(await service.pollPending(50)).toEqual({ polled: 2 });
    } finally {
      spy.mockRestore();
    }
    expect((await signingRepo.findById(bc!.id))!.contract.status).toBe(
      'in_progress',
    );
    expect(
      (await signingRepo.findById(ac!.id))!.contract.lastPolledAt,
    ).toBeTruthy();
  });

  it('reconcileIfStale skips a freshly polled contract and runs an old one', async () => {
    const client = mockClient({
      getContract: vi.fn(async () => benign('sent')),
    });
    const service = await buildService(client);
    const env = await seedAwarded();
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    // Poll only the historical rows prepared above.
    client.getContract = vi.fn(async () => benign('sent'));

    // fresh (just polled) → skip
    await signingRepo.patchContract(active!.id, {
      lastPolledAt: new Date().toISOString(),
    });
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

describe('ContractSigningService.getDownloadUrl — legacy', () => {
  it('기존 PG 계약은 양측 모두에게 다운로드를 공개하지 않는다', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded();
    await seedSentContract(env);
    const contractId = (await (
      await getSigningContractRepo()
    ).findActiveByRfp(env.rfpId))!.id;
    await (
      await getSigningContractRepo()
    ).patchContract(contractId, { status: 'completed' });
    for (const actor of [
      { userId: env.buyerId, workspaceId: env.buyerWsId },
      { userId: env.pgUserId, workspaceId: env.pgWsId },
    ]) {
      expect(
        await service.getDownloadUrl(contractId, 'document', actor),
      ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    }
    expect(client.downloadUrl).not.toHaveBeenCalled();
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
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(
      active!.id,
    ))!.participants.find((p) => p.role === 'buyer')!.email;
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_1',
      status: 'in_progress',
      participants: [
        {
          name: '구매담당',
          email: buyerEmail.toUpperCase(),
          status: 'signed',
          signedAt: '2026-02-01T00:00:00Z',
        },
      ],
    });
    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(after!.participants.find((p) => p.role === 'buyer')?.status).toBe(
      'signed',
    );
  });

  it('reconcile transitions to declined without notifying legacy parties, including repeated polls', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_1',
      status: 'rejected',
      participants: [],
    });

    await service.reconcileStatus(active!.id);
    expect((await signingRepo.findById(active!.id))!.contract.status).toBe(
      'declined',
    );
    const first = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.declined'));
    expect(first.length).toBe(0);
    await service.reconcileStatus(active!.id); // repeat poll — must not re-notify
    const second = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.declined'));
    expect(second.length).toBe(first.length);
  });

  it('reconcile mirrors a provider-side cancellation to local canceled (stops polling)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_1',
      status: 'cancelled',
      participants: [],
    });
    await service.reconcileStatus(active!.id);
    expect((await signingRepo.findById(active!.id))!.contract.status).toBe(
      'canceled',
    );
    // canceled is terminal → no longer pollable
    expect(await signingRepo.findPollable(10)).toHaveLength(0);
  });

  it('reconcile swallows a provider error, bumps lastPolledAt, and keeps status', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockRejectedValue(
      new SnowSignError('SNOWSIGN_NETWORK'),
    );
    const r = await service.reconcileStatus(active!.id);
    expect(r.ok).toBe(true);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('sent');
    expect(after!.contract.lastPolledAt).toBeTruthy();
  });
});

async function activeContractId(rfpId: string): Promise<string> {
  const repo = await getSigningContractRepo();
  const active = await repo.findActiveByRfp(rfpId);
  expect(active, 'awaiting 계약이 있어야 한다').toBeDefined();
  return active!.id;
}
describe('ContractSigningService — operator Slack notifications', () => {
  const detail = (
    status: string,
    parts: SnowSignContractDetail['participants'] = [],
  ): SnowSignContractDetail => ({
    contractId: 'ct_started',
    status,
    participants: parts,
  });

  function eventCalls(event: string) {
    return notifySigningOperator.mock.calls.filter(
      ([arg]) => arg.event === event,
    );
  }

  // 조항형 계약은 공급자 마감이 없어 `expired` 에 **도달할 수 없다** — 아무도 취소하지
  // 않으면 영영 열려 있다. 운영자가 그걸 알 유일한 경로가 이 알림이다.
  it('notifyStaleSent: 마감 없이 오래 열린 계약을 운영자에게 알린다 (CAS 로 1회)', async () => {
    const env = await seedAwaitingContract();
    const repo = await getSigningContractRepo();
    const long = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      await repo.markSentIfAwaiting(env.contractId, {
        providerRef: 'c_stale',
        sentAt: long,
        draft: { origin: 'compose', sentDocument: testSnapshot() },
      }),
    ).toBe(true);
    const service = await buildService(mockClient());

    expect(await service.notifyStaleSent()).toEqual({ notified: 1 });
    // 같은 창에서 다시 돌아도 조용하다 — 폴러가 다시 돌아도 CAS 가 막는다.
    expect(await service.notifyStaleSent()).toEqual({ notified: 0 });
    expect(eventCalls('stale_sent').length).toBe(1);
  });

  // 슬랙 리밋은 1건/초인데 이 루프는 limit(기본 50)까지 돈다. 발송을 await 하지 않으면
  // 한 틱에 50개가 동시에 나가 소켓 50개를 함께 점유하고 429 를 자초한다 — 팬아웃 폭이
  // limit 파라미터와 1:1로 묶여 버린다. 그래서 이 루프에서만 직렬화한다.
  it('notifyStaleSent: 발송을 직렬화한다 — 앞 건이 끝나기 전에 다음 건을 쏘지 않는다', async () => {
    const long = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const repo = await getSigningContractRepo();
    for (const ref of ['c_ser_1', 'c_ser_2']) {
      const env = await seedAwaitingContract();
      expect(
        await repo.markSentIfAwaiting(env.contractId, {
          providerRef: ref,
          sentAt: long,
          draft: { origin: 'compose', sentDocument: testSnapshot() },
        }),
      ).toBe(true);
    }

    // 시드(onAward)도 같은 스파이로 awaiting_created 를 쏘므로, 지연 구현은 시드가
    // 끝난 뒤에 건다 — 안 그러면 시드 발화까지 붙잡혀 카운트가 섞인다.
    const releases: Array<() => void> = [];
    notifySigningOperator.mockImplementation(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );

    const service = await buildService(mockClient());
    const running = service.notifyStaleSent();
    await vi.waitFor(() => expect(eventCalls('stale_sent').length).toBe(1));

    // 두 번째 건은 첫 건이 풀리기 전에는 나가면 안 된다.
    await new Promise((r) => setTimeout(r, 20));
    expect(eventCalls('stale_sent').length).toBe(1);

    releases.forEach((r) => r());
    await vi.waitFor(() => expect(eventCalls('stale_sent').length).toBe(2));
    releases.forEach((r) => r());
    expect(await running).toEqual({ notified: 2 });

    // 구현이 다음 테스트로 새지 않게 되돌린다(beforeEach 는 mockClear 만 한다).
    notifySigningOperator.mockReset();
  });

  it('notifyStaleSent: 공급자 마감이 있는 계약은 건드리지 않는다', async () => {
    const env = await seedAwaitingContract();
    const repo = await getSigningContractRepo();
    const long = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await repo.markSentIfAwaiting(env.contractId, {
      providerRef: 'c_withdeadline',
      sentAt: long,
      draft: { origin: 'template', snowsignTemplateId: 'sst-x' },
    });
    // 템플릿 경로 계약 — provider 가 스스로 만료시킨다.
    await repo.patchContract(env.contractId, {
      expiresAt: new Date().toISOString(),
    });
    const service = await buildService(mockClient());

    expect(await service.notifyStaleSent()).toEqual({ notified: 0 });
    expect(eventCalls('stale_sent').length).toBe(0);
  });

  it('reconcile → completed fires completed exactly once across duplicate polls (webhook+cron dup)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const contractId = await activeContractId(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('completed'),
    );

    await service.reconcileStatus(contractId);
    await service.reconcileStatus(contractId); // 중복 폴

    expect(eventCalls('completed').length).toBe(1);
    expect(eventCalls('completed')[0][0]).toMatchObject({
      rfpCode: env.rfpCode,
    });
  });

  it.each(['declined', 'expired'] as const)(
    'reconcile → %s fires exactly once across duplicate polls',
    async (terminal) => {
      const env = await seedAwarded();
      const client = mockClient();
      const service = await buildService(client);
      await seedSentContract(env);
      const contractId = await activeContractId(env.rfpId);
      (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
        detail(terminal),
      );

      await service.reconcileStatus(contractId);
      await service.reconcileStatus(contractId);

      expect(eventCalls(terminal).length).toBe(1);
    },
  );

  it('provider-side cancel (reconcile) fires canceled exactly once across duplicate polls', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const contractId = await activeContractId(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('canceled'),
    );

    await service.reconcileStatus(contractId);
    await service.reconcileStatus(contractId);

    expect(eventCalls('canceled').length).toBe(1);
  });

  it('a no-op reconcile never notifies (1-min cron poller must stay silent)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await seedSentContract(env);
    const contractId = await activeContractId(env.rfpId);
    notifySigningOperator.mockClear(); // 셋업 발화 제거 — 이후 폴만 본다
    // 'pending' 은 변화 없음(sent 유지) — 폴러가 1분마다 보는 평상시 응답.
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('pending'),
    );

    await service.reconcileStatus(contractId);
    await service.reconcileStatus(contractId);

    expect(notifySigningOperator).not.toHaveBeenCalled();
  });
});

describe('ContractSigningService — operator notification edge coverage', () => {
  it('does not fire completed when the finalize tx rolls back (audit failure)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const auditRepo = await getAuditLogRepo();
    const service = await buildService(client);
    await seedSentContract(env);
    const contractId = await activeContractId(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_started',
      status: 'completed',
      participants: [],
    });
    notifySigningOperator.mockClear();

    const insertSpy = vi
      .spyOn(auditRepo, 'insert')
      .mockImplementationOnce(async () => {
        throw new Error('db blip');
      });
    await service.reconcileStatus(contractId).catch(() => {});
    // tx 롤백 → 상태도 completed 아님, 운영자 알림도 0 (pendingEmits 와 동일 계약).
    expect(
      notifySigningOperator.mock.calls.filter(([a]) => a.event === 'completed')
        .length,
    ).toBe(0);

    await service.reconcileStatus(contractId); // 재시도 성공 → 정확히 1회
    expect(
      notifySigningOperator.mock.calls.filter(([a]) => a.event === 'completed')
        .length,
    ).toBe(1);
    insertSpy.mockRestore();
  });
});

/** compose 발송을 흉내내는 테스트용 최소 스냅샷 — 내용은 이 테스트들의 관심사가 아니다. */
function testSnapshot(): SentContractSnapshot {
  return {
    _v: 1,
    doc: { _v: 1, title: 't', preamble: 'p', clauses: [], closing: 'c' },
    feeRows: [],
    parties: { buyer: { company: '갑' }, pg: { company: '을' } },
  };
}
it('알림톡: 기존 PG 계약의 완료 상태는 동기화하지만 알림은 적재하지 않는다', async () => {
  vi.stubEnv('BUSINESS_ALIMTALK_ENABLED', 'true');
  const { users, alimtalkOutbox } = await import('@/lib/db/schema');
  const env = await seedAwarded();
  await db.update(users).set({ emailVerified: true });
  const client = mockClient();
  const service = await buildService(client);
  await seedSentContract(env);
  const active = await (
    await getSigningContractRepo()
  ).findActiveByRfp(env.rfpId);
  vi.mocked(client.getContract).mockResolvedValue({
    contractId: 'ct_1',
    status: 'completed',
    participants: [],
  });
  await service.reconcileStatus(active!.id);
  await service.reconcileStatus(active!.id);
  const [completed] = await db
    .select({ kind: signingContracts.kind, status: signingContracts.status })
    .from(signingContracts)
    .where(eq(signingContracts.id, active!.id));
  expect(completed).toEqual({
    kind: 'pg_buyer',
    status: 'completed',
  });
  expect(await db.select().from(alimtalkOutbox)).toHaveLength(0);
});

// Retained public read boundary: legacy contracts are internal-only, even for parties.
describe('legacy contract access and reconciliation policy', () => {
  it('hides populated provider identifiers from both parties and strangers', async () => {
    const env = await seedAwarded();
    const id = await seedSentContract(env);
    await db
      .update(signingContracts)
      .set({ snowsignTemplateId: 'sst-historical' })
      .where(eq(signingContracts.id, id));
    __setSnowSignClientForTest(mockClient());
    try {
      const service = await getContractSigningService();
      for (const actor of [
        { userId: env.buyerId, workspaceId: env.buyerWsId },
        { userId: env.pgUserId, workspaceId: env.pgWsId },
        { userId: randomUUID(), workspaceId: randomUUID() },
      ]) {
        expect(await service.getForActor(env.rfpId, actor)).toEqual({
          ok: false,
          error:
            actor.workspaceId === env.buyerWsId
              ? 'CONTRACT_NOT_FOUND'
              : 'FORBIDDEN',
        });
      }
    } finally {
      __setSnowSignClientForTest(undefined);
      __resetContractSigningServiceForTest();
    }
  });

  it.each(['completed', 'declined'])(
    'quarantines weak historical signer policy before %s changes anything',
    async (status) => {
      const env = await seedAwarded();
      const id = await seedSentContract(env);
      await db
        .update(signingParticipants)
        .set({ securityMethod: 'email' })
        .where(eq(signingParticipants.contractId, id));
      const buyer = (await (await getUserRepo()).findContactById(env.buyerId))!;
      const client = mockClient({
        getContract: vi.fn(async () => ({
          contractId: 'ct_started',
          status,
          participants: [
            {
              name: buyer.name,
              email: buyer.email,
              status: 'signed',
              securityMethod: 'identity_verification',
            },
          ],
        })),
      });
      const service = await buildService(client);
      expect(await service.reconcileStatus(id)).toEqual({
        ok: false,
        error: 'SIGNER_POLICY_NOT_ENFORCED',
      });
      const found = (await (await getSigningContractRepo()).findById(id))!;
      expect(found.contract.status).toBe('sent');
      expect(found.participants.map((p) => p.status)).toEqual([
        'pending',
        'pending',
      ]);
      expect(await db.select().from(notifications)).toHaveLength(0);
    },
  );

  it('finalizes a strong historical PG colleague signer whose stored userId is absent', async () => {
    const env = await seedAwarded();
    const id = await seedSentContract(env);
    const colleague = await seedUser(db, {
      email: 'legacy-colleague@x.com',
      name: '동료',
    });
    await seedMembership(db, env.pgWsId, colleague.id, 'member');
    await db
      .update(signingParticipants)
      .set({ userId: null, name: colleague.name, email: colleague.email })
      .where(
        and(
          eq(signingParticipants.contractId, id),
          eq(signingParticipants.role, 'pg'),
        ),
      );
    const service = await buildService(
      mockClient({
        getContract: vi.fn(async () => ({
          contractId: 'ct_started',
          status: 'completed',
          participants: [],
        })),
      }),
    );
    expect(await service.reconcileStatus(id)).toEqual({ ok: true });
    expect(
      (await (await getSigningContractRepo()).findById(id))?.contract.status,
    ).toBe('completed');
  });

  it('requests archive creation once after completion, including duplicate polls', async () => {
    const env = await seedAwarded();
    const id = await seedSentContract(env);
    const archive = await getContractArchiveService();
    const createPending = vi
      .spyOn(archive, 'createPendingForContract')
      .mockResolvedValue({ ok: true });
    const service = await buildService(
      mockClient({
        getContract: vi.fn(async () => ({
          contractId: 'ct_started',
          status: 'completed',
          participants: [],
        })),
      }),
    );
    try {
      await service.reconcileStatus(id);
      await service.reconcileStatus(id);
      expect(createPending).toHaveBeenCalledExactlyOnceWith(id);
    } finally {
      createPending.mockRestore();
    }
  });
});
