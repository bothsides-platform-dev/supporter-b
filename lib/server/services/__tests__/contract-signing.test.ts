import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEND_TAKEN_OVER_TYPE, isSendTakenOverFor } from '@/lib/signing/takeover-signal';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { appOrigins } from '@/lib/site-routing';
import { RECOVERY_MAX_DETAIL_LOOKUPS } from '@/lib/server/services/contract-signing';
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
  pgSigningTemplates,
  rfpInvitations,
  rfps,
  signingContracts,
} from '@/lib/db/schema';
import type { AuditLogRepo, PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type {
  SnowSignClient,
  SnowSignContractDetail,
} from '@/lib/server/signing/snowsign-client';
import { SnowSignError } from '@/lib/server/signing/snowsign-client';
import { logger } from '@/lib/observability/logger';
import { SIGNING_ROLE_LABELS } from '@/lib/signing/template-fields';
import { ContractSigningService } from '../contract-signing';

// O2: 저빈도 실패 사이트가 Sentry 헬퍼를 호출하는지 검증용 — 실 캡처는 no-op 스파이로 대체.
const { captureSigningError } = vi.hoisted(() => ({ captureSigningError: vi.fn() }));
vi.mock('@/lib/server/signing/observability', () => ({ captureSigningError }));

// 운영자 디스코드 알림 — no-op 스파이. 기존 테스트에는 무영향, 전이 분기에서만
// 정확히 1회 발화하는지(폴러 무발화 보장)를 아래 전용 describe 가 검증한다.
const { notifySigningOperator } = vi.hoisted(() => ({ notifySigningOperator: vi.fn() }));
vi.mock('@/lib/server/notifications/operator-signing', () => ({ notifySigningOperator }));

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
function fakeTemplateRepo(seed: PgSigningTemplate[] = []): PgSigningTemplateRepo {
  return {
    create: vi.fn(async () => {}),
    findById: vi.fn(async (id: string) => seed.find((r) => r.id === id)),
    listByWorkspace: vi.fn(async (wsId: string) => seed.filter((r) => r.workspaceId === wsId)),
    updateName: vi.fn(async () => {}),
    updateProviderTemplate: vi.fn(async () => true),
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
  /** 같은 구매사 담당자로 두 번째 딜을 만들 때 — 한 사람이 견적을 여럿 내는 건 평범하다. */
  reuseBuyer?: { id: string; wsId: string };
  /** 같은 PG 워크스페이스가 두 딜을 다 따낸 경우 — 딜 간 경계를 시험할 때 필요하다. */
  reusePg?: { id: string; wsId: string };
} = {}): Promise<Env> {
  const buyer = opts.reuseBuyer
    ? { id: opts.reuseBuyer.id }
    : await seedUser(db, {
        email: `buyer-${randomUUID().slice(0, 6)}@x.com`,
        name: '구매담당',
        ...(opts.buyerPhone === undefined ? { phone: '010-1111-2222' } : opts.buyerPhone ? { phone: opts.buyerPhone } : {}),
      });
  const buyerWs = opts.reuseBuyer ? { id: opts.reuseBuyer.wsId } : await seedBuyerWorkspace(db);
  if (!opts.reuseBuyer) await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgUser = opts.reusePg
    ? { id: opts.reusePg.id }
    : await seedUser(db, {
        email: `pg-${randomUUID().slice(0, 6)}@x.com`,
        name: 'PG담당',
        ...(opts.pgPhone === undefined ? { phone: '010-3333-4444' } : opts.pgPhone ? { phone: opts.pgPhone } : {}),
      });
  const pgWs = opts.reusePg
    ? { id: opts.reusePg.wsId }
    : await seedPgWorkspace(db, `pg-${randomUUID().slice(0, 6)}.io`);
  if (!opts.reusePg) await seedMembership(db, pgWs.id, pgUser.id, 'admin');

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

/**
 * `awaiting_pg_template` 계약이 있는 상태까지 진행한다 — seedAwarded() + onAward().
 * onAward 는 스노우싸인을 부르지 않으므로 빈 mockClient 로 충분하다.
 * (파일의 `awaitingWithProviderContract` 와 같은 관용구를 템플릿 발송용으로 뽑은 것.)
 */
async function seedAwaitingContract(
  opts: { buyerPhone?: string | null; pgPhone?: string | null } = {},
): Promise<Env & { contractId: string }> {
  const env = await seedAwarded(opts);
  const seeder = await buildService(mockClient());
  const r = await seeder.onAward(env.rfpId, env.bidId, {
    userId: env.buyerId,
    workspaceId: env.buyerWsId,
  });
  expect(r.ok, 'seedAwaitingContract: onAward 가 실패하면 이후 단언이 거짓 위에 선다').toBe(true);
  return { ...env, contractId: await activeContractId(env.rfpId) };
}

/**
 * 낙찰 견적에 계약서 템플릿을 연결한다.
 *
 * `pg_signing_templates` 행을 **실제로** 만든다 — `bids.signing_template_id` 는 FK 라
 * PGlite 가 검증하므로 아무 uuid 나 꽂으면 insert 가 터진다.
 */
async function linkTemplate(env: Env): Promise<PgSigningTemplate> {
  const tpl: PgSigningTemplate = {
    id: randomUUID(),
    workspaceId: env.pgWsId,
    snowsignTemplateId: `sst-${randomUUID().slice(0, 6)}`,
    name: '표준 가맹 계약서',
    createdBy: env.pgUserId,
    createdAt: new Date().toISOString(),
  };
  await db
    .insert(pgSigningTemplates)
    .values({ ...tpl, createdAt: new Date(tpl.createdAt) });
  await db.update(bids).set({ signingTemplateId: tpl.id }).where(eq(bids.id, env.bidId));
  return tpl;
}

beforeEach(async () => {
  __resetForTest();
  captureSigningError.mockClear();
  notifySigningOperator.mockClear();
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

  it('mirrors the provider expires_at onto the contract (진행 화면 마감 표시의 데이터원)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
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
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('in_progress', []));
    await service.reconcileStatus(active!.id);
    expect((await signingRepo.findById(active!.id))!.contract.expiresAt).toBeUndefined();
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
      await startSigning(service, env, client);
      const signingRepo = await getSigningContractRepo();
      const active = await signingRepo.findActiveByRfp(env.rfpId);

      (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
        detail(providerStatus, []),
      );

      await service.reconcileStatus(active!.id);
      await service.reconcileStatus(active!.id); // 중복 폴 — CAS 진 쪽은 기록하지 않는다
      const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, auditAction));
      expect(rows.length).toBe(1);
    },
  );

  it('종결 감사 기록이 실패해도 양측 알림은 나간다 — 전이는 이미 커밋된 사실의 기록일 뿐', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const seeder = await buildService(client);
    await startSigning(seeder, env, client);
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
    );
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('rejected', []));

    const r = await service.reconcileStatus(active!.id);
    expect(r.ok).toBe(true);
    expect((await signingRepo.findById(active!.id))!.contract.status).toBe('declined');
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.declined'));
    expect(notifs.length).toBeGreaterThan(0);
  });

  it('제공자 측 취소(cancelled)를 감사 로그에 1회 남긴다 — 앱 취소와 reason 으로 구분', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('cancelled', []));

    await service.reconcileStatus(active!.id);
    await service.reconcileStatus(active!.id);
    // 앱 내 cancel() 과 다른 action — 활동 기록에서 사람이 취소한 것처럼 읽히면 안 된다.
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'signing.canceled_by_provider'));
    expect(rows.length).toBe(1);
    expect(
      await db.select().from(auditLogs).where(eq(auditLogs.action, 'signing.canceled')),
    ).toHaveLength(0);
  });

  it('mirrors participant email_delivery — 반송된 수신자를 화면이 알 수 있게 남긴다', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(active!.id))!.participants.find((p) => p.role === 'buyer')!.email;

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail('sent', [
        { name: '구매담당', email: buyerEmail, status: 'pending', emailDelivery: 'bounced' },
      ]),
    );

    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(after!.participants.find((p) => p.role === 'buyer')?.emailDelivery).toBe('bounced');
  });

  it('email_delivery 는 회복도 미러링한다 — delivered 가 bounced 를 덮고, 회신 생략 시 마지막 값이 남는다', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const buyerEmail = (await signingRepo.findById(active!.id))!.participants.find((p) => p.role === 'buyer')!.email;
    const mock = client.getContract as ReturnType<typeof vi.fn>;

    mock.mockResolvedValue(
      detail('sent', [{ name: '구매담당', email: buyerEmail, status: 'pending', emailDelivery: 'bounced' }]),
    );
    await service.reconcileStatus(active!.id);
    mock.mockResolvedValue(
      detail('sent', [{ name: '구매담당', email: buyerEmail, status: 'pending', emailDelivery: 'delivered' }]),
    );
    await service.reconcileStatus(active!.id);
    let buyer = (await signingRepo.findById(active!.id))!.participants.find((p) => p.role === 'buyer');
    expect(buyer?.emailDelivery).toBe('delivered'); // 회복 — 지속 경고가 걷힌다

    mock.mockResolvedValue(detail('sent', [{ name: '구매담당', email: buyerEmail, status: 'pending' }]));
    await service.reconcileStatus(active!.id);
    buyer = (await signingRepo.findById(active!.id))!.participants.find((p) => p.role === 'buyer');
    expect(buyer?.emailDelivery).toBe('delivered'); // 생략은 지움이 아니다 — 마지막 값 유지
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

  // 알림 딥링크는 수신자의 워크스페이스 타입을 따라가야 한다 — `/rfp/…` 는 buyer 전용
  // 게이트(requireBuyerPage)라 PG 가 누르면 /home 으로 튕긴다. 같은 서비스의 takeover·
  // awaiting 넛지는 이미 `/inbox/…` 를 쓰는데 종결·발송 계열만 buyer 링크 하나로 나갔다.
  it('cancel notifications deep-link each recipient to their own surface (buyer /rfp, PG /inbox)', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);
    await service.cancel(contractId, { userId: env.buyerId, workspaceId: env.buyerWsId }, '재작성');

    const rfp = await (await getRfpRepo()).findById(env.rfpId);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.canceled'));
    expect(rows.length).toBeGreaterThan(0);
    const pgRows = rows.filter((n) => n.userId === env.pgUserId);
    const buyerRows = rows.filter((n) => n.userId === env.buyerId);
    expect(pgRows.length).toBeGreaterThan(0);
    for (const n of pgRows) expect(n.linkUrl).toBe(`/inbox/${rfp!.code}`);
    for (const n of buyerRows) expect(n.linkUrl).toBe(`/rfp/${rfp!.code}`);
  });

  it('remind 는 감사 로그(signing.reminded)를 남긴다', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);

    const r = await service.remind(contractId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'signing.reminded'));
    expect(rows.length).toBe(1);
  });

  it('remind 는 24시간 쿨다운 — 연달아 누르면 REMIND_COOLDOWN, provider 호출 없음', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);
    const actor = { userId: env.buyerId, workspaceId: env.buyerWsId };

    expect((await service.remind(contractId, actor)).ok).toBe(true);
    const second = await service.remind(contractId, actor);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('REMIND_COOLDOWN');
    expect(client.remind).toHaveBeenCalledTimes(1);
  });

  it('remind 쿨다운은 원자적이다 — 동시 클릭 둘 중 하나만 provider 를 부른다', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);

    const [a, b] = await Promise.all([
      service.remind(contractId, { userId: env.buyerId, workspaceId: env.buyerWsId }),
      service.remind(contractId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(client.remind).toHaveBeenCalledTimes(1);
  });

  it('remind 쿨다운은 24시간이 지나면 풀린다', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);
    const actor = { userId: env.buyerId, workspaceId: env.buyerWsId };

    expect((await service.remind(contractId, actor)).ok).toBe(true);
    // 25시간 전으로 백데이트 — 실제 시간 경과를 대신한다.
    await db
      .update(signingContracts)
      .set({ lastRemindedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(signingContracts.id, contractId));
    expect((await service.remind(contractId, actor)).ok).toBe(true);
    expect(client.remind).toHaveBeenCalledTimes(2);
  });

  it('확실히 실행되지 않은 실패(429)만 쿨다운 클레임을 되돌린다 — 즉시 재시도 가능', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);
    const actor = { userId: env.buyerId, workspaceId: env.buyerWsId };

    (client.remind as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new SnowSignError('SNOWSIGN_RATE_LIMIT'),
    );
    const failed = await service.remind(contractId, actor);
    expect(failed.ok).toBe(false);
    const retry = await service.remind(contractId, actor);
    expect(retry.ok).toBe(true);
    expect(client.remind).toHaveBeenCalledTimes(2);
  });

  it('모호한 실패(네트워크/5xx)는 클레임을 유지한다 — 이미 나갔을 수 있는 리마인더를 재시도로 두 통 만들지 않는다', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);
    const actor = { userId: env.buyerId, workspaceId: env.buyerWsId };

    (client.remind as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new SnowSignError('SNOWSIGN_NETWORK'),
    );
    const failed = await service.remind(contractId, actor);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toBe('REMIND_UNCONFIRMED');
    const retry = await service.remind(contractId, actor);
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error).toBe('REMIND_COOLDOWN');
    expect(client.remind).toHaveBeenCalledTimes(1);
  });

  it('resend 는 새 라운드 개설을 감사 로그(signing.resent)에 남긴다', async () => {
    const client = mockClient();
    const { service, env, contractId } = await sentContract(client);

    const r = await service.resend(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'signing.resent'));
    expect(rows.length).toBe(1);
    expect((rows[0].metadata as { priorContractId?: string }).priorContractId).toBe(contractId);
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
    // 폴링은 재시도 예산 1 — 다음 틱이 만회한다. 50건 틱이 재시도 3회를 물면
    // 최악 200 요청으로 공유 한도(100/분)를 혼자 넘긴다.
    expect(client.getContract).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxRetries: 1 }),
    );
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
      error: 'SEND_HELD_BY_TEAMMATE',
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

describe('ContractSigningService.sendFromTemplate', () => {
  it('sends via SnowSign create-contract-from-template + send, and marks the contract sent', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => ({
        contractId: 'c1',
        status: 'pending',
        sentAt: '2026-01-01T00:00:00Z',
      })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result).toEqual({ ok: true });
    // 우리 템플릿 행의 id 가 아니라 **스노우싸인 템플릿 id** 로 불러야 한다.
    expect(client.createContractFromTemplate).toHaveBeenCalledWith(
      tpl.snowsignTemplateId,
      expect.objectContaining({ title: expect.stringContaining('계약서') }),
    );
    expect(client.sendContract).toHaveBeenCalledWith('c1');

    const [row] = await db
      .select()
      .from(signingContracts)
      .where(eq(signingContracts.rfpId, env.rfpId));
    expect(row.status).toBe('sent');
    expect(row.providerRef).toBe('c1');

    // 참여자가 없으면 딜룸 타임라인이 비어 서명 진행 상황을 볼 수 없다.
    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.participants.map((p) => p.role).sort()).toEqual(['buyer', 'pg']);
  });

  // ── 본인인증 기본강제 ─────────────────────────────────────────────────────
  // 인증수단은 템플릿 역할 단위로만 저장되므로(계약별 지정 불가 — 실측) 강제는
  // "템플릿에 easy_cert" + "발송 시 phone 필수"의 짝으로 성립한다. phone 이 없으면
  // 공급자가 400 을 내므로 우리가 먼저 막고 무엇을 해야 하는지 알려준다.

  it('양측 phone 을 공급자에 실어 보내고 참여자를 easy_cert 로 기록한다', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => ({ contractId: 'c1', status: 'pending', sentAt: '2026-01-01T00:00:00Z' })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    expect(
      await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: true });

    // users.phone 은 숫자만으로 저장되지만 공급자는 하이픈 포맷을 받는다(실측).
    expect(client.createContractFromTemplate).toHaveBeenCalledWith(
      tpl.snowsignTemplateId,
      expect.objectContaining({
        participants: [
          expect.objectContaining({ role: '구매사', phone: '010-1111-2222' }),
          expect.objectContaining({ role: 'PG사', phone: '010-3333-4444' }),
        ],
      }),
    );

    const view = await (await getSigningContractRepo()).findById(env.contractId);
    // 타임라인이 '휴대폰 간편인증'을 보여주는 근거 — email 로 굳어 있으면 화면이
    // 강제가 안 걸린 것처럼 거짓말한다.
    expect(view?.participants.map((p) => p.securityMethod)).toEqual(['easy_cert', 'easy_cert']);
    expect(view?.participants.map((p) => p.phone).sort()).toEqual(['010-1111-2222', '010-3333-4444']);
  });

  it('구매사 담당자에게 phone 이 없으면 공급자를 부르지 않고 BUYER_PHONE_REQUIRED 로 막는다', async () => {
    const env = await seedAwaitingContract({ buyerPhone: null });
    const tpl = await linkTemplate(env);
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    expect(
      await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'BUYER_PHONE_REQUIRED' });
    // 공급자 왕복 자체가 없어야 한다 — 400 을 받고 나서 막으면 사용자에게는
    // 원인 없는 SNOWSIGN_VALIDATION 으로 보인다.
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
    expect(client.sendContract).not.toHaveBeenCalled();

    // 리스를 쥐고 있으면 본인이 5분 자가 잠김 — 발송을 못 하는 게 아니라 재시도조차 못 한다.
    const [row] = await db.select().from(signingContracts).where(eq(signingContracts.rfpId, env.rfpId));
    expect(row.status).toBe('awaiting_pg_template');
    expect(row.claimedForSendAt).toBeNull();
  });

  it('PG 담당자 본인에게 phone 이 없으면 PG_PHONE_REQUIRED 로 막는다 (본인이 고칠 수 있는 축)', async () => {
    const env = await seedAwaitingContract({ pgPhone: null });
    const tpl = await linkTemplate(env);
    const client = mockClient({ createContractFromTemplate: vi.fn(), sendContract: vi.fn() });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    expect(
      await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'PG_PHONE_REQUIRED' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('본인인증이 걸리지 않은 기존 템플릿으로는 보내지 않는다 — DB 가 거짓말하는 것을 막는다', async () => {
    // 이 기능 이전에 만들어진 템플릿은 역할 정책이 기본(email)이다. 그대로 보내면
    // 계약은 **이메일 링크로 서명 가능**한데 우리 참여자 행에는 easy_cert 가 적혀
    // 타임라인이 '휴대폰 간편인증'이라고 거짓말한다. reconcile 이 나중에 바로잡지만
    // 그때는 이미 계약이 나간 뒤라 강제가 아니다 — 발송 전에 막아야 한다.
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      getTemplate: vi.fn(async () => ({
        templateId: tpl.snowsignTemplateId,
        hasVariables: false,
        signatureFields: [],
        // 값 없음 = email 과 동일 처리(문서). 기존 템플릿의 실제 모습이다.
        signers: [
          { roleName: SIGNING_ROLE_LABELS[0], securityMethod: undefined },
          { roleName: SIGNING_ROLE_LABELS[1], securityMethod: undefined },
        ],
      })),
      createContractFromTemplate: vi.fn(),
      sendContract: vi.fn(),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    expect(
      await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'TEMPLATE_AUTH_NOT_ENFORCED' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
    expect(client.sendContract).not.toHaveBeenCalled();

    const [row] = await db.select().from(signingContracts).where(eq(signingContracts.rfpId, env.rfpId));
    expect(row.status).toBe('awaiting_pg_template');
    expect(row.claimedForSendAt).toBeNull();
  });

  it('한쪽 역할만 강제돼 있어도 막는다 (fail-closed)', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      getTemplate: vi.fn(async () => ({
        templateId: tpl.snowsignTemplateId,
        hasVariables: false,
        signatureFields: [],
        signers: [
          { roleName: SIGNING_ROLE_LABELS[0], securityMethod: 'easy_cert' },
          { roleName: SIGNING_ROLE_LABELS[1], securityMethod: 'email' },
        ],
      })),
      createContractFromTemplate: vi.fn(),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    expect(
      await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'TEMPLATE_AUTH_NOT_ENFORCED' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('정책 조회가 실패하면 발송하지 않는다 — "확인 실패"를 통과로 읽으면 강제가 조용히 꺼진다', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      getTemplate: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NETWORK', 'boom');
      }),
      createContractFromTemplate: vi.fn(),
      sendContract: vi.fn(),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    expect(
      await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'SNOWSIGN_NETWORK' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
    expect(client.sendContract).not.toHaveBeenCalled();

    // 리스를 쥔 채 실패하면 본인이 5분간 재시도조차 못 한다 — 일시적 네트워크
    // 오류에서 특히 나쁘다(다음 클릭이 만회해야 하는 부류).
    const [row] = await db.select().from(signingContracts).where(eq(signingContracts.rfpId, env.rfpId));
    expect(row.status).toBe('awaiting_pg_template');
    expect(row.claimedForSendAt).toBeNull();
  });

  it('구 번호대(011)는 형식상 유효해도 막는다 — 공급자가 010 만 받는다', async () => {
    // isCompletePhone 은 01[0-9] 를 통과시키므로 이 케이스가 조용히 새면
    // 발송이 공급자 400 으로 죽는다(원인 불명 실패).
    const env = await seedAwaitingContract({ pgPhone: '011-123-4567' });
    const tpl = await linkTemplate(env);
    const client = mockClient({ createContractFromTemplate: vi.fn(), sendContract: vi.fn() });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    expect(
      await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId }),
    ).toEqual({ ok: false, error: 'PG_PHONE_REQUIRED' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('returns NO_LINKED_TEMPLATE when the awarded bid has no linked template', async () => {
    const env = await seedAwaitingContract();
    const client = mockClient();
    const service = await buildService(client, fakeTemplateRepo());

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result).toEqual({ ok: false, error: 'NO_LINKED_TEMPLATE' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  // 남의 워크스페이스 템플릿으로는 못 보낸다 — bid 는 이 PG 것이어도 템플릿 소유는
  // 따로 확인해야 한다(템플릿 id 를 알아낸 PG 가 남의 계약서를 발송하는 경로).
  it('refuses a template owned by another workspace', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const otherWs = await seedPgWorkspace(db, `other-${randomUUID().slice(0, 6)}.io`);
    const client = mockClient();
    const service = await buildService(
      client,
      fakeTemplateRepo([{ ...tpl, workspaceId: otherWs.id }]),
    );

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result).toEqual({ ok: false, error: 'NO_LINKED_TEMPLATE' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN for a non-party actor', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const other = await seedPgWorkspace(db, `stranger-${randomUUID().slice(0, 6)}.io`);
    const client = mockClient();
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: other.id,
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('refuses the buyer — only the awarded PG sends the contract', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient();
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('reuses an already-created providerRef on retry instead of creating a new draft', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    await db
      .update(signingContracts)
      .set({ providerRef: 'already-created' })
      .where(eq(signingContracts.rfpId, env.rfpId));

    const createSpy = vi.fn();
    const client = mockClient({
      createContractFromTemplate: createSpy,
      sendContract: vi.fn(async () => ({ contractId: 'already-created', status: 'pending' })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result).toEqual({ ok: true });
    // 다시 만들면 스노우싸인에 초안이 두 개 쌓이고, 그중 하나는 영영 고아가 된다.
    expect(createSpy).not.toHaveBeenCalled();
    expect(client.sendContract).toHaveBeenCalledWith('already-created');
  });

  // 담당자 둘이 동시에 누르면 계약이 두 건 나가고 서명 요청 메일도 두 통 간다.
  it('serialises concurrent senders with the send lease', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    // 동료가 방금 리스를 잡았다(만료 전). `claimed_for_send_by` 는 users FK 라 실 계정이 필요하다.
    const teammate = await seedUser(db, { name: '동료' });
    const held = await (await getSigningContractRepo()).claimForSend(
      env.contractId,
      new Date(),
      new Date(0),
      teammate.id,
    );
    expect(held).toBe(true);

    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => ({ contractId: 'c1', status: 'pending' })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result).toEqual({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  // 자리를 비운 동료 탭은 하트비트로 리스를 영영 쥔다 — 임베드·복구 진입점과 같은
  // 계약으로, 템플릿 발송도 확인을 받은 takeOver 플래그로 리스를 강제 이어받을 수
  // 있어야 한다(아니면 이 경로만 막다른 길이 된다).
  it('takeOver 면 동료 리스를 가져와 발송하고 밀려난 사람에게만 알린다', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const teammate = await seedUser(db, {
      email: `mate-${randomUUID().slice(0, 6)}@x.com`,
      name: '밀려난동료',
    });
    await seedMembership(db, env.pgWsId, teammate.id, 'member');
    const held = await (await getSigningContractRepo()).claimForSend(
      env.contractId,
      new Date(),
      new Date(0),
      teammate.id,
    );
    expect(held).toBe(true);

    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => ({ contractId: 'c1', status: 'pending' })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(
      env.rfpId,
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { takeOver: true },
    );
    expect(result).toEqual({ ok: true });

    const [row] = await db
      .select()
      .from(signingContracts)
      .where(eq(signingContracts.rfpId, env.rfpId));
    expect(row.status).toBe('sent');

    // 알림은 밀려난 사람에게만 — 뺏은 사람 브라우저의 패널을 내리는 차단 신호다.
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.send_taken_over'));
    expect(rows.map((n) => n.userId)).toEqual([teammate.id]);

    // 감사 로그는 어느 표면에서 뺏었는지 남긴다 — 임베드('embed')와 구분되는 'template'.
    // (복구 스캔의 'recovery' 는 Wave 3 에서 사라졌다 — 스캔은 강제 취득을 하지 않는다.)
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'signing.send_claim_taken'));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).toMatchObject({ surface: 'template' });
  });

  it('takeOver 라도 자기 리스를 다시 잡으면 알림이 가지 않는다', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    // 본인이 이미 쥔 리스(다른 탭) 위에서 takeOver 재발송 — UI 는 isSelf 를 걸러
    // 이어받기를 제안하지 않지만, 서비스도 자기 자신에게 알림을 만들면 안 된다.
    const held = await (await getSigningContractRepo()).claimForSend(
      env.contractId,
      new Date(),
      new Date(0),
      env.pgUserId,
    );
    expect(held).toBe(true);

    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => ({ contractId: 'c1', status: 'pending' })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(
      env.rfpId,
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { takeOver: true },
    );
    expect(result).toEqual({ ok: true });

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.send_taken_over'));
    expect(rows).toHaveLength(0);
  });

  it('releases the claim when SnowSign fails so the PG can retry immediately', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NETWORK');
      }),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    expect(await service.sendFromTemplate(env.rfpId, actor)).toEqual({
      ok: false,
      error: 'SNOWSIGN_NETWORK',
    });

    // 리스가 잡힌 채 남으면 5분 넘게 재시도가 막힌다.
    client.sendContract = vi.fn(async () => ({ contractId: 'c1', status: 'pending' }));
    expect(await service.sendFromTemplate(env.rfpId, actor)).toEqual({ ok: true });
  });

  it('refuses once the contract has left awaiting (already sent)', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    await (await getSigningContractRepo()).markSentIfAwaiting(env.contractId, {
      providerRef: 'ct_x',
      sentAt: new Date().toISOString(),
    });
    const client = mockClient();
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result).toEqual({ ok: false, error: 'ALREADY_SENT' });
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  // ── H3: 응답 유실 자가치유 ──────────────────────────────────────────────
  // send 가 실제로 나갔는데 응답을 못 받으면 행이 awaiting+providerRef 로 남는다.
  // 재시도가 send 를 또 부르면 INVALID_CONTRACT_STATUS 로 영구 실패하고, 복구 스캔은
  // 자기 ref 라 제외하며, 폴링은 awaiting 을 안 본다 — 유일한 출구는 재시도 진입에서
  // provider 실상태를 확인해 dispatched 면 그대로 바인딩하는 것이다.
  it('self-heals a lost send response: dispatched providerRef binds without re-sending', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    await (await getSigningContractRepo()).patchContract(env.contractId, { providerRef: 'c_lost' });
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [
          { name: '구매담당', email: 'buyer@b.example', status: 'pending' },
          { name: 'PG담당', email: 'pg@p.example', status: 'pending' },
        ], { contractId: 'c_lost', sentAt: '2026-01-02T03:04:05.000Z' }),
      ),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result.ok).toBe(true);
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
    expect(client.sendContract).not.toHaveBeenCalled();

    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.contract.status).toBe('sent');
    expect(view?.contract.providerRef).toBe('c_lost');
    // 발송 시각은 지금이 아니라 provider 가 기억하는 실제 시각이어야 한다.
    expect(view?.contract.sentAt).toBe('2026-01-02T03:04:05.000Z');
    expect(view?.participants).toHaveLength(2);
  });

  // ── M3: 왕복 중 강제 이어받기에 밀린 발송은 커밋하지 못하고, 자기가 만든
  //        계약을 보상 취소한다 ─────────────────────────────────────────────
  it('loses to a mid-flight forceClaim and compensating-cancels its own contract', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => {
        // SnowSign 왕복 도중 동료가 이어받는다 — 리스 소유자가 바뀐다.
        await (await getSigningContractRepo()).forceClaimForSend(
          env.contractId,
          new Date(Date.now() + 1000),
          env.buyerId,
        );
        return { contractId: 'c_race', status: 'draft' };
      }),
      sendContract: vi.fn(async () => ({
        contractId: 'c_race',
        status: 'pending',
        sentAt: new Date().toISOString(),
      })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('SEND_TAKEN_OVER');
    // 이 계약은 우리가 만들었고 이미 발송됐다 — attach 의 무보상 원칙과 달리 여기선
    // 취소 핸들(c_race)을 우리가 쥐고 있으므로 보상 취소한다.
    expect(client.cancel).toHaveBeenCalledWith('c_race', expect.any(String));
    // 뺏은 쪽이 이어가야 하므로 행은 awaiting 그대로다.
    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.contract.status).toBe('awaiting_pg_template');
  });

  // ── M1: 임베드 진입도 providerRef 선존재를 무시하면 안 된다 ───────────────
  it('createSendEmbedSession self-heals a dispatched pre-existing providerRef (no overwrite)', async () => {
    const env = await seedAwaitingContract();
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [], { contractId: 'c_lost', sentAt: '2026-01-03T00:00:00.000Z' }),
      ),
    });
    const service = await buildService(client);
    await (await getSigningContractRepo()).patchContract(env.contractId, { providerRef: 'c_lost' });

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    // 실발송된 계약이 이미 있다 — 임베드를 열어 두 번째 계약을 만들게 하지 않고
    // 그 자리에서 바인딩한 뒤 ALREADY_SENT 로 화면을 새로고침시킨다.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('ALREADY_SENT');
    expect(client.createEmbedSession).not.toHaveBeenCalled();
    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.contract.status).toBe('sent');
    expect(view?.contract.providerRef).toBe('c_lost');

    // (#8) 자가치유는 임의로 오래된 계약을 잇는 것 — "전자서명이 시작됐어요"(새 발송
    // 문구)로 알리면 며칠 전에 온 메일을 다시 기다리게 만든다. 연결 문구여야 한다.
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.sent'));
    expect(rows.length).toBeGreaterThan(0);
    for (const n of rows) expect(n.title).toContain('연결');
  });

  // completed 는 "발송된 적 없음"이 아니라 "완주했는데 신호를 놓침"이다 — 취소를
  // 시도하거나 ref 를 지우고 새 임베드를 열면 서명 완료된 계약 위에 두 번째 계약이
  // 생긴다. 분류 불가(미지 status)도 같은 이유로 손대지 않는다(fail-closed).
  it('createSendEmbedSession refuses to touch a completed pre-existing providerRef', async () => {
    const env = await seedAwaitingContract();
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [], { contractId: 'c_done', status: 'completed' }),
      ),
    });
    const service = await buildService(client);
    await (await getSigningContractRepo()).patchContract(env.contractId, { providerRef: 'c_done' });

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(r.ok).toBe(false);
    expect(client.cancel).not.toHaveBeenCalled();
    expect(client.createEmbedSession).not.toHaveBeenCalled();
    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.contract.providerRef).toBe('c_done'); // 핸들 보존
  });

  // M3 보상 취소가 남긴 canceled ref — 재시도가 죽은 ref 로 send 를 또 부르면
  // INVALID_STATUS 로 영구 데드엔드다. 지우고 새로 만들어야 한다.
  it('sendFromTemplate clears a terminal (canceled) providerRef and creates fresh', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    await (await getSigningContractRepo()).patchContract(env.contractId, { providerRef: 'c_dead' });
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [], { contractId: 'c_dead', status: 'canceled' }),
      ),
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c_new', status: 'draft' })),
      sendContract: vi.fn(async () => ({
        contractId: 'c_new',
        status: 'pending',
        sentAt: '2026-01-01T00:00:00Z',
      })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result).toEqual({ ok: true });
    expect(client.createContractFromTemplate).toHaveBeenCalledTimes(1);
    expect(client.sendContract).toHaveBeenCalledWith('c_new');
    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.contract.providerRef).toBe('c_new');
  });

  // 구매사 취소가 SnowSign 왕복 중에 이겼을 때. 취소 경로는 `providerRef` 를
  // 우리가 적기 **전에** 읽으면 null 을 보고 provider 취소를 건너뛴다 — 그래서
  // 여기서 우리가 보상 취소하지 않으면 **이미 서명 요청 메일이 나간 계약이**
  // 아무도 취소할 수 없는 채로 살아남는다(행은 terminal 이라 reconcile 도 안 본다).
  it('compensating-cancels its own contract when a buyer cancel wins mid-send', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const repo = await getSigningContractRepo();
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c_bcancel', status: 'draft' })),
      sendContract: vi.fn(async () => {
        // 발송 왕복 중 구매사 취소가 CAS 를 이긴다. providerRef 는 이미 위
        // patchContract 로 박혀 있으므로, 취소 후 상태는 canceled + 같은 ref 다.
        await repo.transitionIfActive(env.contractId, 'canceled', new Date(), {
          cancelReason: '구매사 취소',
        });
        return {
          contractId: 'c_bcancel',
          status: 'pending',
          sentAt: '2026-01-03T00:00:00.000Z',
        };
      }),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result.ok).toBe(false);
    // 메일은 이미 나갔고 취소 핸들은 우리만 쥐고 있다 — 반드시 보상 취소한다.
    expect(client.cancel).toHaveBeenCalledWith('c_bcancel', expect.any(String));
    const view = await repo.findById(env.contractId);
    expect(view?.contract.status).toBe('canceled');
  });

  // (#1) 스테일 ref 정리는 파괴적(cancel+클리어)이라 **리스 안에서만** 돌아야 한다.
  // 동료의 sendFromTemplate 이 리스를 쥔 채 왕복 중일 때 임베드 진입이 그 draft 를
  // 죽이면, 동료의 발송이 성공한 뒤 죽은 계약을 가리키는 sent 딜룸이 된다.
  it('createSendEmbedSession does not touch a stale ref while a teammate holds the lease', async () => {
    const env = await seedAwaitingContract();
    const repo = await getSigningContractRepo();
    await repo.patchContract(env.contractId, { providerRef: 'c_inflight' });
    // 동료가 유효한 리스를 쥐고 있다(왕복 중인 sendFromTemplate).
    const mateId = env.buyerId; // 아무 사용자나 — 리스 소유자만 다르면 된다
    await repo.claimForSend(env.contractId, new Date(), new Date(Date.now() - 300_000), mateId);
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [], { contractId: 'c_inflight', status: 'draft' }),
      ),
    });
    const service = await buildService(client);

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('SEND_HELD_BY_TEAMMATE');
    expect(client.cancel).not.toHaveBeenCalled();
    expect((await repo.findById(env.contractId))?.contract.providerRef).toBe('c_inflight');
  });

  // (#5) 경합 보상 취소가, 같은 ref 를 방금 정당하게 바인딩한 다른 경로(자가치유)의
  // 살아있는 계약을 죽이면 안 된다 — 행이 같은 ref 로 sent 가 됐다면 취소를 건너뛴다.
  it('compensating cancel is skipped when the row was bound to the same ref by another path', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const repo = await getSigningContractRepo();
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c_same', status: 'draft' })),
      sendContract: vi.fn(async () => {
        // 왕복 중 다른 경로(자가치유)가 같은 ref 를 먼저 바인딩했다.
        await repo.markSentIfAwaiting(env.contractId, {
          providerRef: 'c_same',
          sentAt: '2026-01-01T00:00:00Z',
        });
        return { contractId: 'c_same', status: 'pending', sentAt: '2026-01-01T00:00:00Z' };
      }),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const result = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CONTRACT_CHANGED');
    expect(client.cancel).not.toHaveBeenCalled(); // 살아있는 c_same 을 죽이지 않는다
    expect((await repo.findById(env.contractId))?.contract.status).toBe('sent');
  });

  // (#9) 임베드 경로와 대칭 — 분류 불가(미지) status 는 fail-closed. draft 재사용
  // 경로로 흘리면 미지-라이브 계약에 send 를 또 부른다.
  it('sendFromTemplate fail-closes on an unclassifiable provider status', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    await (await getSigningContractRepo()).patchContract(env.contractId, { providerRef: 'c_weird' });
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [], { contractId: 'c_weird', status: 'weird_new_status' }),
      ),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const r = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('SNOWSIGN_INVALID_STATUS');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
    expect(client.sendContract).not.toHaveBeenCalled();
    expect((await (await getSigningContractRepo()).findById(env.contractId))?.contract.providerRef).toBe('c_weird');
  });

  it('createSendEmbedSession clears a draft pre-existing providerRef and proceeds', async () => {
    const env = await seedAwaitingContract();
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [], { contractId: 'c_draft', status: 'draft' }),
      ),
      createEmbedSession: vi.fn(async () => ({
        iframeUrl: 'https://embed.example/x',
        sessionId: 'es_1',
      })),
    });
    const service = await buildService(client);
    await (await getSigningContractRepo()).patchContract(env.contractId, { providerRef: 'c_draft' });

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });

    // 초안은 아무에게도 안 갔다 — 지우고 임베드로 진행한다. 지우지 않으면 임베드
    // 발송이 초안 ref 를 덮어써 취소 핸들이 유실된다(H3 상황에선 살아있는 계약).
    expect(r.ok).toBe(true);
    expect(client.cancel).toHaveBeenCalledWith('c_draft', expect.any(String));
    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.contract.providerRef).toBeUndefined();
    expect(view?.contract.status).toBe('awaiting_pg_template');
  });
});

// onAward 는 after() fire-and-forget 라 프로세스 재시작·DB 순단에 유실될 수 있고,
// 유실되면 계약 행이 없어 계약 탭 자체가 안 뜬다(넛지는 기존 awaiting 행만, 폴링은
// sent/in_progress 만 봐서 어느 것도 이걸 되살리지 못한다). cron 스윕이 자가치유한다.
describe('ContractSigningService.sweepMissingContracts', () => {
  it('creates the missing awaiting row for an awarded RFP whose onAward never landed', async () => {
    const lost = await seedAwarded(); // awarded 인데 onAward 유실 — 계약 행 없음
    await seedAwaitingContract(); // 정상 딜 — 스윕이 건드리면 안 된다
    const service = await buildService(mockClient());

    const r = await service.sweepMissingContracts(20);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(1);
    expect(await activeContractId(lost.rfpId)).toBeTruthy();

    // 멱등 — 다음 틱은 0건.
    const r2 = await service.sweepMissingContracts(20);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.created).toBe(0);
  });

  // (#2) 서명 기능 이전에 낙찰된 옛 딜까지 "고아"로 보면 첫 배포일에 수백 건의
  // 대기 라운드+알림이 쏟아진다. onAward 유실은 초 단위 사고라 최근성 창이면 충분하다.
  it('ignores awarded RFPs older than the recency floor', async () => {
    const old = await seedAwarded();
    await db
      .update(rfps)
      .set({ updatedAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(eq(rfps.id, old.rfpId));
    const service = await buildService(mockClient());

    const r = await service.sweepMissingContracts(20);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(0);
    expect(await (await getSigningContractRepo()).findActiveByRfp(old.rfpId)).toBeUndefined();
  });

  // (#4) awarded 인데 awardedBidId 가 NULL(SET NULL 잔재)인 행이 LIMIT 창을 차지하면
  // 진짜 고아가 영영 스윕되지 않는다 — WHERE 에서 걸러야 한다.
  it('a null-awardedBidId row does not consume the per-tick budget', async () => {
    const nullRow = await seedAwarded();
    await db.update(rfps).set({ awardedBidId: null }).where(eq(rfps.id, nullRow.rfpId));
    const realOrphan = await seedAwarded();
    // null 행이 더 최신이어도(정렬 우선) 창을 차지하면 안 된다.
    await db
      .update(rfps)
      .set({ updatedAt: new Date(Date.now() + 1000) })
      .where(eq(rfps.id, nullRow.rfpId));
    const service = await buildService(mockClient());

    const r = await service.sweepMissingContracts(1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(1);
    expect(await activeContractId(realOrphan.rfpId)).toBeTruthy();
  });

  // (#3) 한 행이 영구히 실패해도(포이즌) 스윕 전체가 죽으면 안 된다 — cron 이 매 틱
  // 500 나면서 진짜 고아는 영영 안 낫는다.
  it('isolates a poison row — the rest of the batch still heals', async () => {
    const poison = await seedAwarded();
    const healthy = await seedAwarded();
    // healthy 가 나중에 처리되도록 poison 을 최신으로.
    await db
      .update(rfps)
      .set({ updatedAt: new Date(Date.now() + 1000) })
      .where(eq(rfps.id, poison.rfpId));
    const service = await buildService(mockClient());
    const onAwardSpy = vi
      .spyOn(service, 'onAward')
      .mockRejectedValueOnce(new Error('poison boom'));

    const r = await service.sweepMissingContracts(20);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(1);
    expect(await activeContractId(healthy.rfpId)).toBeTruthy();
    onAwardSpy.mockRestore();
  });
});

describe('ContractSigningService.attachProviderContract', () => {
  async function awaitingEnv() {
    const env = await seedAwarded();
    return env;
  }

  // 복구는 정의상 **과거에** 나간 계약을 뒤늦게 잇는 것 — sentAt 을 지금으로 박으면
  // 타임라인이 실제보다 늦고, 구매사가 이미 서명한 계약(in_progress)을 sent 로
  // 강등하면 "서명을 진행해 주세요" 알림이 이미 서명한 사람에게 간다.
  it('records provider sentAt and in_progress status honestly when binding', async () => {
    const env = await seedAwaitingContract();
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [], {
          contractId: 'ct_hon',
          status: 'in_progress',
          sentAt: '2026-01-05T09:00:00.000Z',
        }),
      ),
    });
    const service = await buildService(client);

    const r = await service.attachProviderContract(env.rfpId, 'ct_hon', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(true);

    const view = await (await getSigningContractRepo()).findById(env.contractId);
    expect(view?.contract.sentAt).toBe('2026-01-05T09:00:00.000Z');
    expect(view?.contract.status).toBe('in_progress');
  });

  it('uses linking copy (not signing-request copy) for a recovery-sourced bind', async () => {
    const env = await seedAwaitingContract();
    // 복구 출처는 상관키 게이트를 지나므로 실제 당사자 이메일이 참여자에 있어야 한다.
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    const pg = await (await getUserRepo()).findContactById(env.pgUserId);
    const client = mockClient({
      getContract: vi.fn(async () =>
        embedCreated(env.contractId, [
          { name: '구매담당', email: buyer!.email, status: 'pending' },
          { name: 'PG담당', email: pg!.email, status: 'pending' },
        ], { contractId: 'ct_rc' }),
      ),
    });
    const service = await buildService(client);

    // 복구 경로의 신호는 expectedContractId 다 — source 는 서버가 이 유무로 파생한다.
    const r = await service.attachProviderContract(
      env.rfpId,
      'ct_rc',
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { expectedContractId: env.contractId },
    );
    expect(r.ok).toBe(true);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.sent'));
    expect(rows.length).toBeGreaterThan(0);
    // 이미 발송돼 있던 계약을 연결한 것 — "이메일 링크에서 서명을 진행해 주세요"라고
    // 새 발송처럼 말하면 안 된다(수신자는 며칠 전에 그 메일을 받았다).
    for (const n of rows) expect(n.title).toContain('연결');
  });

  // 이 브랜치가 새로 여는 구멍이다. 복구 스캔 이전에는 PG 가 **바인딩되지 않은** 공급자
  // 계약의 id 를 알 방법이 없었다(postMessage 가 도착했다면 그 자리에서 바인딩돼
  // provider_ref 유일성에 잠긴다 — 고아란 곧 그 메시지를 못 받았다는 뜻이다).
  // 이제 목록이 그 id 를 브라우저에 알려주므로, 딜 A 에서 배운 id 를 딜 B 에 붙일 수
  // 있는지가 실제 질문이 된다. 붙으면 구매사 B 가 구매사 A 의 계약 문서를 본다.
  //
  // 게이트를 `expectedContractId` 유무로 두면 공격자는 그 필드를 빼는 것만으로 끈다.
  // 그래서 판정 근거는 **서버가 기록한 노출 사실**이다.
  it('스캔이 노출한 계약은 다른 딜에 붙지 않는다 — expectedContractId 를 빼도', async () => {
    const a = await seedAwarded();
    // **같은 PG 워크스페이스**가 두 딜을 다 따냈다. 다른 워크스페이스면 ACL 이 먼저
    // 막아버려 이 게이트를 시험하지 못한다(그 형태로 처음 썼다가 변이 검증에서 잡혔다).
    const b = await seedAwarded({ reusePg: { id: a.pgUserId, wsId: a.pgWsId } });
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(a.rfpId, a.bidId, { userId: a.buyerId, workspaceId: a.buyerWsId });
    await service.onAward(b.rfpId, b.bidId, { userId: b.buyerId, workspaceId: b.buyerWsId });
    const aId = await activeContractId(a.rfpId);
    const bId = await activeContractId(b.rfpId);

    // 딜 A 의 스캔이 이 id 를 PG 브라우저에 노출했다.
    await (await getSigningContractRepo()).recordRecoveryDisclosure(aId, ['ct_orphan_of_a']);

    // 딜 B 에 임베드 경로인 척(= expectedContractId 없이) 붙이려 한다.
    client.getContract = vi.fn(async () => embedCreated(bId, []));
    const r = await service.attachProviderContract(b.rfpId, 'ct_orphan_of_a', {
      userId: a.pgUserId,
      workspaceId: a.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });

    // 딜 B 는 손대지 않은 채 대기로 남아야 한다.
    const found = await (await getSigningContractRepo()).findById(bId);
    expect(found?.contract.status).toBe('awaiting_pg_template');
    expect(found?.contract.providerRef).toBeFalsy();
  });

  // 반대편도 못박는다: 노출된 적 없는 계약(임베드에서 방금 만든 것)은 상관키를
  // 요구받지 않는다. 여기에 상관키를 걸면 구매사 이메일 오타로 나간 계약이
  // **바인딩조차 안 돼** 취소 핸들(provider_ref)을 영영 못 얻는다 — 경고보다 나쁘다.
  it('노출된 적 없는 계약은 구매사 이메일이 어긋나도 붙고 경고만 한다', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    client.getContract = vi.fn(async () =>
      embedCreated(scId, [
        { name: '오타', email: 'typo@nowhere.example', status: 'pending' },
      ]),
    );
    const r = await service.attachProviderContract(env.rfpId, 'ct_typo', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.participantMismatch).toBe(true);
    expect((await (await getSigningContractRepo()).findById(scId))?.contract.providerRef).toBe(
      'ct_typo',
    );
  });

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

  // 이미 끝난(또는 취소된) 계약을 붙이면 딜룸이 '전자서명이 시작됐어요'를 알린 뒤
  // 곧바로 '서명 완료'가 되고, 이 딜의 누구도 서명하지 않은 문서의 다운로드 링크가
  // 구매사에게 열린다. 임베드를 막 끝낸 계약이 종결 상태일 수는 없다.
  it.each(['completed', 'cancelled', 'expired', 'rejected'])(
    'refuses a %s provider contract',
    async (providerStatus) => {
      const env = await awaitingEnv();
      const client = mockClient();
      const service = await buildService(client);
      await service.onAward(env.rfpId, env.bidId, {
        userId: env.buyerId,
        workspaceId: env.buyerWsId,
      });
      const scId = await activeContractId(env.rfpId);
      client.getContract = vi.fn(async () => embedCreated(scId, [], { status: providerStatus }));

      const r = await service.attachProviderContract(env.rfpId, 'ct_embed', {
        userId: env.pgUserId,
        workspaceId: env.pgWsId,
      });
      expect(r).toEqual({ ok: false, error: 'CONTRACT_NOT_SENT' });
    },
  );

  // 복구 다이얼로그는 몇 분씩 열려 있을 수 있고, 그 사이 resend 가 새 대기 라운드를
  // 연다. 액션은 rfpCode 로 활성 행을 다시 찾으므로, 사용자가 보던 그 계약이 맞는지
  // 확인하지 않으면 엉뚱한 라운드에 붙는다.
  it('refuses when the contract the user was looking at is no longer the active one', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);

    const r = await service.attachProviderContract(
      env.rfpId,
      'ct_embed',
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { expectedContractId: randomUUID() },
    );
    expect(r).toEqual({ ok: false, error: 'CONTRACT_CHANGED' });
    expect(client.getContract).not.toHaveBeenCalled();
    expect((await (await getSigningContractRepo()).findById(scId))?.contract.providerRef).toBeFalsy();
  });

  it('binds normally when expectedContractId matches', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    const repo = await getUserRepo();
    const buyer = await repo.findContactById(env.buyerId);
    const pg = await repo.findContactById(env.pgUserId);
    // expectedContractId 가 있으면 복구 경로로 판정돼 상관키를 다시 본다.
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [
        { name: '구매담당', email: buyer!.email, status: 'pending' },
        { name: 'PG담당', email: pg!.email, status: 'pending' },
      ]),
    );

    const r = await service.attachProviderContract(
      env.rfpId,
      'ct_embed',
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { expectedContractId: scId },
    );
    expect(r.ok).toBe(true);
  });

  // 복구로 붙인 것과 임베드가 스스로 알린 것을 운영에서 구분할 수 있어야 한다.
  it('records how the binding happened in the audit trail', async () => {
    const env = await awaitingEnv();
    const client = mockClient();
    const auditRepo = await getAuditLogRepo();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const scId = await activeContractId(env.rfpId);
    const repo = await getUserRepo();
    const buyer = await repo.findContactById(env.buyerId);
    const pg = await repo.findContactById(env.pgUserId);
    client.getContract = vi.fn(async () =>
      embedCreated(scId, [
        { name: '구매담당', email: buyer!.email, status: 'pending' },
        { name: 'PG담당', email: pg!.email, status: 'pending' },
      ]),
    );
    const insertSpy = vi.spyOn(auditRepo, 'insert');

    await service.attachProviderContract(
      env.rfpId,
      'ct_embed',
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      // 출처는 클라이언트가 고르지 못한다 — 서버가 expectedContractId 유무로 도출한다.
      { expectedContractId: scId },
    );
    const sent = insertSpy.mock.calls.find((c) => (c[0] as { action?: string })?.action === 'signing.sent');
    expect((sent?.[0] as { metadata?: { source?: string } })?.metadata?.source).toBe('recovery');
    insertSpy.mockRestore();
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
// 완료 postMessage 가 유실되면 계약은 실제로 발송됐는데(양측에 서명 메일이 갔다)
// 딜룸만 대기에 갇힌다. `external_id` 로는 못 찾지만(실측 Q3) 참여자 이메일은 회신되고,
// 우리는 구매사 담당자와 낙찰 PG 워크스페이스 멤버의 이메일을 안다.
//
// **자동 채택이 아니다** — 후보를 PG 에게 보여주고 사람이 고른다. 그래서 여기서는
// 남의 계약이 목록에 **뜨는 것 자체**가 유출이다(제목·발송시각·수신자 수).
describe('ContractSigningService.listRecoveryCandidates', () => {
  async function env0() {
    const env = await seedAwarded();
    const repo = await getUserRepo();
    const buyer = await repo.findContactById(env.buyerId);
    const pg = await repo.findContactById(env.pgUserId);
    return { ...env, buyerEmail: buyer!.email, pgEmail: pg!.email };
  }
  const pgActor = (e: { pgUserId: string; pgWsId: string }) => ({
    userId: e.pgUserId,
    workspaceId: e.pgWsId,
  });
  /** 운영과 같은 모양 — `external_id` 는 회신되지 않는다(실측 Q3). */
  const found = (
    participants: SnowSignContractDetail['participants'],
    over: Partial<SnowSignContractDetail> = {},
  ) => ({ ...embedCreated('unused', participants, over), externalId: undefined });

  async function awaiting(env: Env, client: SnowSignClient) {
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    return { service, scId: await activeContractId(env.rfpId) };
  }

  // 양측이 서명까지 마쳤는데 완료 신호가 유실되면, provider 는 completed 인데 우리 행은
  // awaiting 에 providerRef 없이 남는다 — 스캔이 completed 를 안 보면 그 딜은 **영구히
  // 갇힌다**(구매사 화면은 무기한 '준비 중', 완료본은 다운로드 불가, 남는 길은 이미
  // 서명한 사람들에게 재서명 요청뿐).
  it('완료된 고아도 후보로 잡고 alreadyCompleted 로 표시한다', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async ({ status }: { status?: string } = {}) =>
        status === 'completed'
          ? { rows: [{ contractId: 'ct_done', status: 'completed' }], totalPages: 1 }
          : { rows: [], totalPages: 1 },
      ),
      getContract: vi.fn(async () =>
        found(
          [
            { name: '구매담당', email: env.buyerEmail, status: 'signed' },
            { name: 'PG담당', email: env.pgEmail, status: 'signed' },
          ],
          { status: 'completed' },
        ),
      ),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.alreadyCompleted).toBe(true);
  });

  // **완료 버킷은 단조 증가한다** — 조직의 모든 계약이 결국 거기로 가고, 딜이 대기에
  // 오래 있을수록(=고아 상황) 더 쌓인다. 최신순으로만 12칸을 자르면 정작 찾아야 할
  // 진짜 고아(pending)가 통째로 밀려난다. 그러면 화면은 0건 → '계약서 올리기' 로
  // 유도하고, 이 기능이 막으려던 두 번째 발송이 **정상 경로**가 된다.
  it('완료 계약이 많아도 dispatched 고아가 후보에서 밀려나지 않는다', async () => {
    const env = await env0();
    const parties = [
      { name: '구매담당', email: env.buyerEmail, status: 'pending' },
      { name: 'PG담당', email: env.pgEmail, status: 'pending' },
    ];
    // 진짜 고아는 오래됐고, 무관한 완료 계약 20건이 그 뒤에 쌓였다.
    const completedRows = Array.from({ length: 20 }, (_, i) => ({
      contractId: `ct_other_${i}`,
      status: 'completed',
      sentAt: `2026-08-03T10:${String(i).padStart(2, '0')}:00Z`,
    }));
    const client = mockClient({
      listContracts: vi.fn(async ({ status }: { status?: string } = {}) =>
        status === 'completed'
          ? { rows: completedRows, totalPages: 1 }
          : status === 'pending'
            ? {
                rows: [
                  { contractId: 'ct_my_orphan', status: 'pending', sentAt: '2026-08-03T09:00:00Z' },
                ],
                totalPages: 1,
              }
            : { rows: [], totalPages: 1 },
      ),
      getContract: vi.fn(async (id: string) =>
        found(parties, {
          contractId: id,
          status: id === 'ct_my_orphan' ? 'pending' : 'completed',
        }),
      ),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates.map((c) => c.providerContractId)).toContain('ct_my_orphan');
  });

  // 붙이면 종결까지 가야 완료본 다운로드가 열린다. **새 종결 전이를 만들지 않고**
  // 기존 단일 경로(ensureFinalized)를 태운다.
  it('완료된 고아를 연결하면 계약이 completed 로 종결된다', async () => {
    const env = await env0();
    const detail = () =>
      found(
        [
          { name: '구매담당', email: env.buyerEmail, status: 'signed' },
          { name: 'PG담당', email: env.pgEmail, status: 'signed' },
        ],
        { status: 'completed', contractId: 'ct_done' },
      );
    const client = mockClient({
      listContracts: vi.fn(async ({ status }: { status?: string } = {}) =>
        status === 'completed'
          ? { rows: [{ contractId: 'ct_done', status: 'completed' }], totalPages: 1 }
          : { rows: [], totalPages: 1 },
      ),
      getContract: vi.fn(async () => detail()),
    });
    const { service, scId } = await awaiting(env, client);
    // 노출 기록을 남기는 것은 스캔이다 — 실제 동선을 그대로 탄다.
    await service.listRecoveryCandidates(env.rfpId, pgActor(env));

    const r = await service.attachProviderContract(env.rfpId, 'ct_done', pgActor(env), {
      expectedContractId: scId,
    });
    expect(r.ok).toBe(true);
    const view = await (await getSigningContractRepo()).findById(scId);
    expect(view?.contract.status).toBe('completed');
    expect(view?.contract.providerRef).toBe('ct_done');
  });

  // **보안 경계.** 완료 계약을 무조건 받아들이면, 임베드 postMessage 로 흘러든 완료
  // id 하나로 아무도 서명하지 않은 문서의 다운로드가 이 딜룸에 열린다. 수락 근거는
  // 클라이언트가 보내는 값이 아니라 **서버가 기록한 노출 사실**이어야 한다.
  it('스캔이 내보낸 적 없는 완료 계약은 붙지 않는다', async () => {
    const env = await env0();
    const client = mockClient({
      getContract: vi.fn(async () =>
        found(
          [
            { name: '구매담당', email: env.buyerEmail, status: 'signed' },
            { name: 'PG담당', email: env.pgEmail, status: 'signed' },
          ],
          { status: 'completed', contractId: 'ct_never_listed' },
        ),
      ),
    });
    const { service, scId } = await awaiting(env, client);

    // 스캔을 거치지 않았다 = 노출 대장에 없다.
    const r = await service.attachProviderContract(env.rfpId, 'ct_never_listed', pgActor(env));
    expect(r).toEqual({ ok: false, error: 'CONTRACT_NOT_SENT' });
    const view = await (await getSigningContractRepo()).findById(scId);
    expect(view?.contract.status).toBe('awaiting_pg_template');
  });

  // 목록이 나가는데 기록이 안 남으면 게이트의 근거가 통째로 사라진다.
  it('스캔은 내보낸 후보를 노출 대장에 남긴다', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_disclosed', status: 'pending' }],
        totalPages: 1,
      })),
      getContract: vi.fn(async () =>
        found([
          { name: '구매담당', email: env.buyerEmail, status: 'pending' },
          { name: 'PG담당', email: env.pgEmail, status: 'pending' },
        ]),
      ),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates.map((c) => c.providerContractId)).toEqual(['ct_disclosed']);
    expect(await (await getSigningContractRepo()).isRefDisclosed('ct_disclosed')).toBe(true);
  });


  // ── 보안 ────────────────────────────────────────────────────────────────
  //
  // 이 PR 에서 가장 중요한 테스트. 한 구매사 담당자가 견적을 둘 내는 건 아주 평범하고,
  // 상관키가 구매사 이메일뿐이면 그냥 대기 중이던 딜1 이 딜2 의 계약을 후보로 집어온다.
  it('does not list a contract belonging to another deal of the same buyer', async () => {
    const dealA = await env0();
    const dealB = await seedAwarded({ reuseBuyer: { id: dealA.buyerId, wsId: dealA.buyerWsId } });
    const pgB = await (await getUserRepo()).findContactById(dealB.pgUserId);
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_dealB', status: 'pending' }],
        totalPages: 1,
      })),
      // 참여자는 구매사 담당자(딜A와 동일인) + PG-B 담당자.
      getContract: vi.fn(async () =>
        found([
          { name: '구매담당', email: dealA.buyerEmail, status: 'pending' },
          { name: 'PG담당', email: pgB!.email, status: 'pending' },
        ]),
      ),
    });
    const { service, scId } = await awaiting(dealA, client);
    void scId;

    const r = await service.listRecoveryCandidates(dealA.rfpId, pgActor(dealA));
    expect(r).toEqual({ ok: true, candidates: [], truncated: false });
  });

  // 상세 조회 실패(429 소진·5xx)로 진짜 후보가 떨어져 나갔는데 truncated 를 안 세우면
  // 화면은 "찾지 못했어요"→'계약서 올리기'로 유도한다 — 이 기능이 막으려던 이중 발송.
  it('marks truncated when a detail lookup fails (a real candidate may have been dropped)', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_flaky', status: 'pending' }],
        totalPages: 1,
      })),
      getContract: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_RATE_LIMIT', undefined, 'HTTP 429');
      }),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidates).toEqual([]);
      expect(r.truncated).toBe(true);
    }
    // 스캔 경로는 재시도 예산 1 — 다음 클릭이 만회하는 경로가 재시도 3회를 태우면
    // 논리 16회가 HTTP 64회로 불어 공유 100req/분 한도를 혼자 소진한다.
    expect(client.listContracts).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 1 }),
    );
    expect(client.getContract).toHaveBeenCalledWith(
      'ct_flaky',
      expect.objectContaining({ maxRetries: 1 }),
    );
  });

  // PG conjunct 의 짝. 같은 PG 가 **다른 구매사**에게 보낸 계약은 이 딜의 것이 아니다 —
  // org 키가 플랫폼 공용이라 그 계약에도 우리 PG 멤버가 참여자로 들어 있다.
  it('does not list a contract this PG sent to a different buyer', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_other_buyer', status: 'pending' }],
        totalPages: 1,
      })),
      getContract: vi.fn(async () =>
        found([
          { name: '남의 구매담당', email: 'someone@else.example', status: 'pending' },
          { name: 'PG담당', email: env.pgEmail, status: 'pending' },
        ]),
      ),
    });
    const { service } = await awaiting(env, client);

    expect(await service.listRecoveryCandidates(env.rfpId, pgActor(env))).toEqual({
      ok: true,
      candidates: [],
      truncated: false,
    });
  });

  // 목록이 후보를 흘려보내도 바인딩이 다시 막아야 한다 — 목록이 유일한 관문이면
  // 상관키가 한 번 틀리는 순간 남의 계약이 이 딜룸에 붙는다.
  it('refuses a recovery bind whose participants do not match this deal', async () => {
    const env = await env0();
    const client = mockClient();
    const { service, scId } = await awaiting(env, client);
    client.getContract = vi.fn(async () =>
      found([{ name: '남', email: 'someone@else.example', status: 'pending' }]),
    );

    const r = await service.attachProviderContract(env.rfpId, 'ct_foreign', pgActor(env), {
      expectedContractId: scId,
    });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await (await getSigningContractRepo()).findById(scId))?.contract.providerRef).toBeFalsy();
  });

  it('refuses a buyer actor and a non-awarded PG without touching the provider', async () => {
    const env = await env0();
    const client = mockClient();
    const { service } = await awaiting(env, client);
    const other = await seedAwarded();

    expect(
      await service.listRecoveryCandidates(env.rfpId, {
        userId: env.buyerId,
        workspaceId: env.buyerWsId,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      await service.listRecoveryCandidates(env.rfpId, pgActor(other)),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    // 존재 오라클도, 예산 소모도 없어야 한다.
    expect(client.listContracts).not.toHaveBeenCalled();
  });

  it('returns only the agreed keys', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_1', status: 'pending' }],
        totalPages: 1,
      })),
      getContract: vi.fn(async () =>
        found(
          [
            { name: '구매담당', email: env.buyerEmail, status: 'pending' },
            { name: 'PG담당', email: env.pgEmail, status: 'pending' },
          ],
          { title: '가맹 계약서', sentAt: '2026-08-02T00:00:00Z' },
        ),
      ),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 참여자 이메일·status·원본 봉투가 새어나가면 안 된다. 키를 늘리는 것은 공급자
    // 데이터를 PG 브라우저로 더 내보내는 결정이라, 이 가드가 멈춰 세운다.
    // `alreadyCompleted` 는 의도적 추가 — 화면이 완료 고아를 따로 떼어 보여주고
    // 자동 선택하지 않으려면 필요하고, status 원본이 아니라 우리가 파생한 불리언이다.
    expect(Object.keys(r.candidates[0]!).sort()).toEqual(
      [
        'alreadyCompleted',
        'createdAt',
        'participantCount',
        'providerContractId',
        'sentAt',
        'title',
      ].sort(),
    );
    expect(r.candidates[0]?.participantCount).toBe(2);
  });

  // ── 상관키 ──────────────────────────────────────────────────────────────
  it('finds a contract sent by a PG colleague who did not submit the bid', async () => {
    const env = await env0();
    const colleague = await seedUser(db, { email: `pg2-${randomUUID().slice(0, 6)}@x.com`, name: '동료' });
    await seedMembership(db, env.pgWsId, colleague.id, 'member');
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_1', status: 'pending' }],
        totalPages: 1,
      })),
      getContract: vi.fn(async () =>
        found([
          { name: '구매담당', email: env.buyerEmail, status: 'pending' },
          { name: '동료', email: colleague.email, status: 'pending' },
        ]),
      ),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.candidates.map((c) => c.providerContractId)).toEqual(['ct_1']);
  });

  it('finds an in_progress orphan (the buyer signed before the PG noticed)', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async (o) => ({
        rows: o?.status === 'in_progress' ? [{ contractId: 'ct_ip', status: 'in_progress' }] : [],
        totalPages: 1,
      })),
      getContract: vi.fn(async () =>
        found(
          [
            { name: '구매담당', email: env.buyerEmail, status: 'signed' },
            { name: 'PG담당', email: env.pgEmail, status: 'pending' },
          ],
          { status: 'in_progress' },
        ),
      ),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.candidates.map((c) => c.providerContractId)).toEqual(['ct_ip']);
  });

  it('matches emails case-insensitively', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_1', status: 'pending' }],
        totalPages: 1,
      })),
      getContract: vi.fn(async () =>
        found([
          { name: '구매담당', email: env.buyerEmail.toUpperCase(), status: 'pending' },
          { name: 'PG담당', email: env.pgEmail.toUpperCase(), status: 'pending' },
        ]),
      ),
    });
    const { service } = await awaiting(env, client);
    expect((await service.listRecoveryCandidates(env.rfpId, pgActor(env))).ok).toBe(true);
  });

  it('drops bound, pre-dating, and non-dispatched candidates', async () => {
    const env = await env0();
    const both = [
      { name: '구매담당', email: env.buyerEmail, status: 'pending' },
      { name: 'PG담당', email: env.pgEmail, status: 'pending' },
    ];
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [
          { contractId: 'ct_bound', status: 'pending' },
          { contractId: 'ct_old', status: 'pending' },
          { contractId: 'ct_draft', status: 'pending' },
          { contractId: 'ct_good', status: 'pending' },
        ],
        totalPages: 1,
      })),
      getContract: vi.fn(async (id: string) =>
        id === 'ct_old'
          ? found(both, { createdAt: '2000-01-01T00:00:00Z' })
          : id === 'ct_draft'
            ? found(both, { status: 'draft' })
            : found(both),
      ),
    });
    const { service, scId } = await awaiting(env, client);
    // 다른 딜이 ct_bound 를 이미 쥐고 있다.
    const other = await seedAwarded();
    await (await buildService(mockClient())).onAward(other.rfpId, other.bidId, {
      userId: other.buyerId,
      workspaceId: other.buyerWsId,
    });
    await (await getSigningContractRepo()).markSentIfAwaiting(await activeContractId(other.rfpId), {
      providerRef: 'ct_bound',
      sentAt: new Date().toISOString(),
    });
    void scId;

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.candidates.map((c) => c.providerContractId)).toEqual(['ct_good']);
  });

  // ── 예산 ────────────────────────────────────────────────────────────────
  it('caps detail lookups and reports truncation', async () => {
    const env = await env0();
    const rows = Array.from({ length: 40 }, (_, i) => ({ contractId: `ct_${i}`, status: 'pending' }));
    const getContract = vi.fn(async () => found([]));
    const client = mockClient({
      listContracts: vi.fn(async () => ({ rows, totalPages: 1 })),
      getContract,
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.truncated).toBe(true);
    expect(getContract.mock.calls.length).toBeLessThanOrEqual(RECOVERY_MAX_DETAIL_LOOKUPS);
  });

  it('reports truncation when the provider paginated', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async () => ({ rows: [], totalPages: 4 })),
    });
    const { service } = await awaiting(env, client);
    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r).toEqual({ ok: true, candidates: [], truncated: true });
  });

  // 정렬이 없으면 cap 12 가 **어느** 후보를 보여줄지를 우연이 정한다 — 최신 것이
  // 잘려나가면 정작 방금 보낸 계약을 못 찾는다.
  it('keeps the newest candidates when the cap truncates', async () => {
    const env = await env0();
    const both = [
      { name: '구매담당', email: env.buyerEmail, status: 'pending' },
      { name: 'PG담당', email: env.pgEmail, status: 'pending' },
    ];
    // 오래된 것 30건 뒤에 최신 1건 — 정렬이 없으면 cap 에 밀려 사라진다.
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => ({
        contractId: `ct_old_${i}`,
        status: 'pending',
        sentAt: '2026-08-02T00:00:00Z',
      })),
      { contractId: 'ct_newest', status: 'pending', sentAt: '2026-08-02T09:00:00Z' },
    ];
    const client = mockClient({
      listContracts: vi.fn(async () => ({ rows, totalPages: 1 })),
      getContract: vi.fn(async () => found(both)),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.candidates.map((c) => c.providerContractId)).toContain('ct_newest');
  });

  // 정렬 순서가 문서에 없어 1페이지에 최신이 없을 수 있다 — 마지막 장도 받아야 한다.
  it('also reads the last page when the provider paginated', async () => {
    const env = await env0();
    const both = [
      { name: '구매담당', email: env.buyerEmail, status: 'pending' },
      { name: 'PG담당', email: env.pgEmail, status: 'pending' },
    ];
    const listContracts = vi.fn(async (o?: { page?: number }) => ({
      rows: o?.page === 3 ? [{ contractId: 'ct_on_last_page', status: 'pending' }] : [],
      totalPages: 3,
    }));
    const client = mockClient({ listContracts, getContract: vi.fn(async () => found(both)) });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.candidates.map((c) => c.providerContractId)).toContain('ct_on_last_page');
    expect(listContracts).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }));
  });

  // 후보 한 건의 상세 조회가 실패해도 나머지는 살아야 한다.
  it('keeps scanning when one detail lookup throws', async () => {
    const env = await env0();
    const both = [
      { name: '구매담당', email: env.buyerEmail, status: 'pending' },
      { name: 'PG담당', email: env.pgEmail, status: 'pending' },
    ];
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [
          { contractId: 'ct_boom', status: 'pending' },
          { contractId: 'ct_ok', status: 'pending' },
        ],
        totalPages: 1,
      })),
      getContract: vi.fn(async (id: string) => {
        if (id === 'ct_boom') throw new SnowSignError('SNOWSIGN_NOT_FOUND');
        return found(both);
      }),
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.candidates.map((c) => c.providerContractId)).toEqual(['ct_ok']);
  });

  // 목록 단계에서 선정 이전 계약을 걸러 상세 조회 예산을 아낀다(상세단 검사와 별개).
  it('skips pre-award rows before spending a detail lookup', async () => {
    const env = await env0();
    const getContract = vi.fn(async () => found([]));
    const client = mockClient({
      listContracts: vi.fn(async () => ({
        rows: [{ contractId: 'ct_ancient', status: 'pending', createdAt: '2000-01-01T00:00:00Z' }],
        totalPages: 1,
      })),
      getContract,
    });
    const { service } = await awaiting(env, client);

    const r = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(r.ok && r.candidates).toEqual([]);
    expect(getContract).not.toHaveBeenCalled();
  });

  // ── 리스 ────────────────────────────────────────────────────────────────
  it('takes the send lease for the scan and releases it afterwards', async () => {
    const env = await env0();
    const client = mockClient();
    const { service, scId } = await awaiting(env, client);

    expect((await service.listRecoveryCandidates(env.rfpId, pgActor(env))).ok).toBe(true);
    // 스캔이 끝나면 임베드를 바로 열 수 있어야 한다.
    const repo = await getSigningContractRepo();
    expect((await repo.findById(scId))?.contract).toBeTruthy();
    expect((await service.listRecoveryCandidates(env.rfpId, pgActor(env))).ok).toBe(true);
  });

  it('refuses while a colleague holds the send lease, without touching the provider', async () => {
    const env = await env0();
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({ sessionId: 's', iframeUrl: 'https://e.example/x' })),
    });
    const { service } = await awaiting(env, client);
    expect((await service.createSendEmbedSession(env.rfpId, pgActor(env))).ok).toBe(true);

    expect(await service.listRecoveryCandidates(env.rfpId, pgActor(env))).toEqual({
      ok: false,
      error: 'SEND_HELD_BY_TEAMMATE',
    });
    expect(client.listContracts).not.toHaveBeenCalled();
  });

  it('releases the lease even when the scan throws', async () => {
    const env = await env0();
    const client = mockClient({
      listContracts: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NETWORK');
      }),
    });
    const { service } = await awaiting(env, client);
    expect((await service.listRecoveryCandidates(env.rfpId, pgActor(env))).ok).toBe(false);

    // 리스가 남아 있으면 두 번째 시도가 막힌다.
    const again = await service.listRecoveryCandidates(env.rfpId, pgActor(env));
    expect(again.ok === false && again.error).not.toBe('SEND_HELD_BY_TEAMMATE');
  });

  it('does nothing once the contract has left awaiting', async () => {
    const env = await env0();
    const client = mockClient();
    const { service, scId } = await awaiting(env, client);
    await (await getSigningContractRepo()).markSentIfAwaiting(scId, {
      providerRef: 'ct_done',
      sentAt: new Date().toISOString(),
    });
    expect(await service.listRecoveryCandidates(env.rfpId, pgActor(env))).toEqual({
      ok: false,
      error: 'ALREADY_SENT',
    });
    expect(client.listContracts).not.toHaveBeenCalled();
  });
});

// 동료가 임베드를 열어둔 채 자리를 비우면 하트비트가 리스를 무한 연장해 영영 풀리지
// 않는다. 강제로 이어받되, 밀려난 사람이 **실제로 못 보내게** 해야 한다 — 스노우싸인에
// 세션 취소 API 가 없으므로 우리가 할 수 있는 건 그 사람 화면을 즉시 내리는 것뿐이고,
// 그 신호는 알림이 나른다.
describe('ContractSigningService — 발송 리스 강제 이어받기', () => {
  async function held() {
    const env = await seedAwarded();
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({ sessionId: 's', iframeUrl: 'https://e.example/x' })),
    });
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    const scId = await activeContractId(env.rfpId);
    // 동료(=env.pgUserId)가 먼저 잡는다.
    expect(
      (await service.createSendEmbedSession(env.rfpId, {
        userId: env.pgUserId,
        workspaceId: env.pgWsId,
      })).ok,
    ).toBe(true);
    // 같은 워크스페이스의 다른 담당자.
    const mate = await seedUser(db, { email: `mate-${randomUUID().slice(0, 6)}@x.com`, name: '이어받는이' });
    await seedMembership(db, env.pgWsId, mate.id, 'member');
    return { env, client, service, scId, mate };
  }

  it('기본 경로는 절대 뺏지 않는다', async () => {
    const { env, service, scId } = await held();
    const before = await (await getSigningContractRepo()).findSendLease(scId);

    const r = await service.createSendEmbedSession(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r).toEqual({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    const after = await (await getSigningContractRepo()).findSendLease(scId);
    expect(after?.claimedAt.toISOString()).toBe(before?.claimedAt.toISOString());
  });

  it('takeOver 면 가져오고 밀려난 사람에게만 알린다', async () => {
    const { env, service, scId, mate } = await held();

    const r = await service.createSendEmbedSession(
      env.rfpId,
      { userId: mate.id, workspaceId: env.pgWsId },
      { takeOver: true },
    );
    expect(r.ok).toBe(true);
    expect((await (await getSigningContractRepo()).findSendLease(scId))?.holderUserId).toBe(mate.id);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.send_taken_over'));
    // 밀려난 사람에게 가고, 뺏은 사람에게는 안 간다 — 두 단언을 따로 해야 한다.
    expect(rows.map((n) => n.userId)).toEqual([env.pgUserId]);
    expect(rows.some((n) => n.userId === mate.id)).toBe(false);

    // 이 알림은 통지가 아니라 **차단 신호**다 — 받은 브라우저가 이 링크의 마지막
    // 경로 세그먼트로 자기 딜인지 판정해 임베드를 내린다(isSendTakenOverFor).
    // 여기서 링크 모양이 바뀌면 신호가 조용히 죽으므로 양쪽을 함께 못박는다.
    const rfp = await (await getRfpRepo()).findById(env.rfpId);
    expect(rows[0]?.type).toBe(SEND_TAKEN_OVER_TYPE);
    expect(isSendTakenOverFor({ type: rows[0]!.type, linkUrl: rows[0]!.linkUrl ?? undefined }, rfp!.code)).toBe(true);
    // 인앱만 — 위험한 창이 몇 분인데 이메일은 그보다 늦게 도착한다.
    expect(rows.map((n) => n.channel)).toEqual(['in_app']);
  });

  // 다른 워크스페이스가 뺏을 수 있으면 봉인이 무의미하다.
  it('다른 워크스페이스는 뺏지 못하고 리스도 안 건드린다', async () => {
    const { env, service, scId } = await held();
    const other = await seedAwarded();
    const before = await (await getSigningContractRepo()).findSendLease(scId);

    const r = await service.createSendEmbedSession(
      env.rfpId,
      { userId: other.pgUserId, workspaceId: other.pgWsId },
      { takeOver: true },
    );
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    const after = await (await getSigningContractRepo()).findSendLease(scId);
    expect(after?.claimedAt.toISOString()).toBe(before?.claimedAt.toISOString());
    expect(after?.holderUserId).toBe(env.pgUserId);
  });

  // 이어받기는 **파괴적**이다: 동료 화면이 닫히고 그 사람이 올리던 PDF·서명칸이
  // 사라진다. 그 절반을 세션 발급보다 먼저 커밋하면, 발급이 실패했을 때 동료 작업만
  // 날아가고 리스는 아무도 안 쥔 상태가 된다 — 아무도 이득을 못 본다.
  // 실패할 수 있는 쪽(공급자 호출)을 먼저 하고, 파괴적인 쪽을 마지막에 커밋한다.
  it('세션 발급이 실패하면 동료 리스를 건드리지 않는다', async () => {
    const { env, client, service, scId, mate } = await held();
    const before = await (await getSigningContractRepo()).findSendLease(scId);

    client.createEmbedSession = vi.fn(async () => {
      throw new SnowSignError('SNOWSIGN_NETWORK', 'boom');
    });
    const r = await service.createSendEmbedSession(
      env.rfpId,
      { userId: mate.id, workspaceId: env.pgWsId },
      { takeOver: true },
    );
    expect(r.ok).toBe(false);

    // 동료는 여전히 쥐고 있고, 알림도 가지 않았다.
    const after = await (await getSigningContractRepo()).findSendLease(scId);
    expect(after?.holderUserId).toBe(env.pgUserId);
    expect(after?.claimedAt.getTime()).toBe(before?.claimedAt.getTime());
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.send_taken_over'));
    expect(rows).toEqual([]);
  });

  it('이미 발송된 계약은 강제로도 못 가져온다', async () => {
    const { env, service, scId, mate } = await held();
    await (await getSigningContractRepo()).markSentIfAwaiting(scId, {
      providerRef: 'ct_done',
      sentAt: new Date().toISOString(),
    });

    expect(
      await service.createSendEmbedSession(
        env.rfpId,
        { userId: mate.id, workspaceId: env.pgWsId },
        { takeOver: true },
      ),
    ).toEqual({ ok: false, error: 'ALREADY_SENT' });
  });

  it('자기 리스를 다시 잡으면 알림이 가지 않는다', async () => {
    const { env, service } = await held();

    const r = await service.createSendEmbedSession(
      env.rfpId,
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { takeOver: true },
    );
    expect(r.ok).toBe(true);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'signing.send_taken_over'));
    expect(rows).toHaveLength(0);
  });

  // 뺏긴 것과 그냥 만료된 것은 사용자에게 다른 사건이다.
  it('하트비트가 뺏긴 뒤엔 SEND_TAKEN_OVER, 그냥 만료면 CONTRACT_BUSY', async () => {
    const { env, service, scId, mate } = await held();
    const repo = await getSigningContractRepo();
    const mine = (await repo.findSendLease(scId))!.claimedAt.toISOString();

    await service.createSendEmbedSession(
      env.rfpId,
      { userId: mate.id, workspaceId: env.pgWsId },
      { takeOver: true },
    );
    expect(
      await service.renewSendEmbedClaim(env.rfpId, mine, {
        userId: env.pgUserId,
        workspaceId: env.pgWsId,
      }),
    ).toEqual({ ok: false, error: 'SEND_TAKEN_OVER' });

    // 아무도 안 쥔 상태에서 옛 토큰으로 연장하면 그냥 경합이다.
    await repo.releaseSendClaim(scId, (await repo.findSendLease(scId))!.claimedAt);
    expect(
      await service.renewSendEmbedClaim(env.rfpId, mine, {
        userId: env.pgUserId,
        workspaceId: env.pgWsId,
      }),
    ).toEqual({ ok: false, error: 'CONTRACT_BUSY' });
  });

  it('리스를 쥔 사람의 이름을 알려준다 (PG 에게만)', async () => {
    const { env, service } = await held();

    const r = await service.getSendLeaseHolder(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok && r.holder?.userId).toBe(env.pgUserId);
    expect(r.ok && typeof r.holder?.name).toBe('string');

    // 구매사는 어느 PG 담당자가 작성 중인지 알 이유가 없다.
    expect(
      await service.getSendLeaseHolder(env.rfpId, {
        userId: env.buyerId,
        workspaceId: env.buyerWsId,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
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
    return new ContractSigningService(
      db,
      patched,
      rfpRepo,
      bidRepo,
      userRepo,
      wsRepo,
      auditRepo,
      client,
      fakeTemplateRepo(),
    );
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
      error: 'SEND_HELD_BY_TEAMMATE',
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
    ).toEqual({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
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
      error: 'SEND_HELD_BY_TEAMMATE',
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
      error: 'SEND_HELD_BY_TEAMMATE',
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
    expect(await repo.claimForSend(scId, stale, new Date(stale.getTime() - 1), env.pgUserId)).toBe(true);

    // 만료된 리스는 새 세션 발급을 막지 못한다.
    expect((await service.createSendEmbedSession(env.rfpId, pgActor)).ok).toBe(true);
  });
});

// ── 운영자 디스코드 알림 (전이 시 정확히 1회, no-op 폴은 0회) ────────────────────
describe('ContractSigningService — operator Discord notifications', () => {
  const detail = (status: string, parts: SnowSignContractDetail['participants'] = []): SnowSignContractDetail => ({
    contractId: 'ct_started',
    status,
    participants: parts,
  });

  function eventCalls(event: string) {
    return notifySigningOperator.mock.calls.filter(([arg]) => arg.event === event);
  }

  it('onAward fires awaiting_created exactly once (idempotent on repeat)', async () => {
    const env = await seedAwarded();
    const service = await buildService(mockClient());
    const actor = { userId: env.buyerId, workspaceId: env.buyerWsId };

    await service.onAward(env.rfpId, env.bidId, actor);
    await service.onAward(env.rfpId, env.bidId, actor); // 멱등 재호출

    const calls = eventCalls('awaiting_created');
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toMatchObject({ rfpCode: env.rfpCode });
  });

  it('embed bind (attachProviderContract) fires sent exactly once', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);

    expect(eventCalls('sent').length).toBe(1);
    expect(eventCalls('sent')[0][0]).toMatchObject({ rfpCode: env.rfpCode });
    // 같은 providerRef 재부착(멱등 경로) → 추가 발화 없음.
    await service.attachProviderContract(env.rfpId, 'ct_started', {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(eventCalls('sent').length).toBe(1);
  });

  it('sendFromTemplate fires sent exactly once', async () => {
    const env = await seedAwaitingContract();
    const tpl = await linkTemplate(env);
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => ({
        contractId: 'c1',
        status: 'pending',
        sentAt: '2026-01-01T00:00:00Z',
      })),
    });
    const service = await buildService(client, fakeTemplateRepo([tpl]));

    const r = await service.sendFromTemplate(env.rfpId, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(true);
    expect(eventCalls('sent').length).toBe(1);
  });

  it('reconcile → completed fires completed exactly once across duplicate polls (webhook+cron dup)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const contractId = await activeContractId(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('completed'));

    await service.reconcileStatus(contractId);
    await service.reconcileStatus(contractId); // 중복 폴

    expect(eventCalls('completed').length).toBe(1);
    expect(eventCalls('completed')[0][0]).toMatchObject({ rfpCode: env.rfpCode });
  });

  it.each(['declined', 'expired'] as const)(
    'reconcile → %s fires exactly once across duplicate polls',
    async (terminal) => {
      const env = await seedAwarded();
      const client = mockClient();
      const service = await buildService(client);
      await startSigning(service, env, client);
      const contractId = await activeContractId(env.rfpId);
      (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail(terminal));

      await service.reconcileStatus(contractId);
      await service.reconcileStatus(contractId);

      expect(eventCalls(terminal).length).toBe(1);
    },
  );

  it('cancel fires canceled exactly once (repeat cancel is a silent no-op)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const contractId = await activeContractId(env.rfpId);
    const actor = { userId: env.buyerId, workspaceId: env.buyerWsId };

    await service.cancel(contractId, actor, '재작성');
    await service.cancel(contractId, actor, '재작성'); // 이미 canceled → no-op

    expect(eventCalls('canceled').length).toBe(1);
  });

  it('provider-side cancel (reconcile) fires canceled exactly once across duplicate polls', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const contractId = await activeContractId(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('canceled'));

    await service.reconcileStatus(contractId);
    await service.reconcileStatus(contractId);

    expect(eventCalls('canceled').length).toBe(1);
  });

  it('a no-op reconcile never notifies (1-min cron poller must stay silent)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const contractId = await activeContractId(env.rfpId);
    notifySigningOperator.mockClear(); // 셋업 발화 제거 — 이후 폴만 본다
    // 'pending' 은 변화 없음(sent 유지) — 폴러가 1분마다 보는 평상시 응답.
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail('pending'));

    await service.reconcileStatus(contractId);
    await service.reconcileStatus(contractId);

    expect(notifySigningOperator).not.toHaveBeenCalled();
  });
});

// ── 운영자 알림 커버리지 보강 (ship Step 7 갭) ──────────────────────────────────
describe('ContractSigningService — operator notification edge coverage', () => {
  it('recovery-source bind fires attached (not sent)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    const scId = await activeContractId(env.rfpId);
    const buyer = await (await getUserRepo()).findContactById(env.buyerId);
    const pg = await (await getUserRepo()).findContactById(env.pgUserId);
    client.getContract = vi.fn(async () => ({
      contractId: 'ct_recovered',
      status: 'pending',
      participants: [
        { name: '구매담당', email: buyer!.email, status: 'pending' },
        { name: 'PG담당', email: pg!.email, status: 'pending' },
      ],
    }));

    const r = await service.attachProviderContract(
      env.rfpId,
      'ct_recovered',
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { expectedContractId: scId }, // → source: 'recovery'
    );
    expect(r.ok).toBe(true);

    const attached = notifySigningOperator.mock.calls.filter(([a]) => a.event === 'attached');
    const sent = notifySigningOperator.mock.calls.filter(([a]) => a.event === 'sent');
    expect(attached.length).toBe(1);
    expect(sent.length).toBe(0);
  });

  it('does not fire completed when the finalize tx rolls back (audit failure)', async () => {
    const env = await seedAwarded();
    const client = mockClient();
    const auditRepo = await getAuditLogRepo();
    const service = await buildService(client);
    await startSigning(service, env, client);
    const contractId = await activeContractId(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_started',
      status: 'completed',
      participants: [],
    });
    notifySigningOperator.mockClear();

    const insertSpy = vi.spyOn(auditRepo, 'insert').mockImplementationOnce(async () => {
      throw new Error('db blip');
    });
    await service.reconcileStatus(contractId).catch(() => {});
    // tx 롤백 → 상태도 completed 아님, 운영자 알림도 0 (pendingEmits 와 동일 계약).
    expect(
      notifySigningOperator.mock.calls.filter(([a]) => a.event === 'completed').length,
    ).toBe(0);

    await service.reconcileStatus(contractId); // 재시도 성공 → 정확히 1회
    expect(
      notifySigningOperator.mock.calls.filter(([a]) => a.event === 'completed').length,
    ).toBe(1);
    insertSpy.mockRestore();
  });
});
