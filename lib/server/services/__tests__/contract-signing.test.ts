import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAuditLogRepo,
  getBidRepo,
  getPgSigningTemplateRepo,
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
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createContractFromTemplate: vi.fn(async () => ({ contractId: 'ct_1', status: 'draft' })),
    getContract: vi.fn(),
    getStatus: vi.fn(),
    sendContract: vi.fn(async () => ({ contractId: 'ct_1', status: 'pending', sentAt: 'z' })),
    downloadUrl: vi.fn(),
    auditCertificateUrl: vi.fn(),
    remind: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  } as SnowSignClient;
}

async function buildService(client: SnowSignClient): Promise<ContractSigningService> {
  const [signingRepo, templateRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo] =
    await Promise.all([
      getSigningContractRepo(),
      getPgSigningTemplateRepo(),
      getRfpRepo(),
      getBidRepo(),
      getUserRepo(),
      getWorkspaceRepo(),
      getAuditLogRepo(),
    ]);
  return new ContractSigningService(
    db,
    signingRepo,
    templateRepo,
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
  /** withTemplate 일 때 링크된 PG 계약서 템플릿 id. 없으면 undefined. */
  templateId?: string;
};

async function seedAwarded(opts: {
  withTemplate?: boolean;
  /** 견적 제출 시 이 템플릿을 미리 골라둔 상태로 만든다(withTemplate 필요). */
  preselectTemplate?: boolean;
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

  let templateId: string | undefined;
  if (opts.withTemplate) {
    templateId = randomUUID();
    await db.insert(pgSigningTemplates).values({
      id: templateId,
      workspaceId: pgWs.id,
      snowsignTemplateId: 'tmpl_1',
      name: '표준 가맹계약서',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      variableMapping: { 정산주기: 'bid.settleCycle' },
      createdBy: pgUser.id,
    });
    if (opts.preselectTemplate) {
      await db.update(bids).set({ signingTemplateId: templateId }).where(eq(bids.id, bidId));
    }
  }

  return {
    buyerId: buyer.id,
    buyerWsId: buyerWs.id,
    pgUserId: pgUser.id,
    pgWsId: pgWs.id,
    rfpId: rfp.id,
    rfpCode: rfp.code,
    bidId,
    templateId,
  };
}

/**
 * 선정 → PG 가 계약서를 골라 발송, 즉 `sent` 계약이 있는 상태까지 진행한다.
 * 발송은 더 이상 선정에 딸려오지 않으므로 sent 를 전제하는 테스트는 이 헬퍼를 쓴다.
 */
async function startSigning(service: ContractSigningService, env: Env): Promise<void> {
  // seedAwarded({ withTemplate: true }) 없이 부르면 templateId 가 undefined 라
  // sendContract 가 조용히 TEMPLATE_NOT_FOUND 로 끝난다 — 그러면 이 헬퍼는 아무것도
  // 안 하고, 그걸 전제로 쓴 단언은 거짓 위에 선다. 크게 실패시킨다.
  expect(env.templateId, 'startSigning needs seedAwarded({ withTemplate: true })').toBeDefined();
  await service.onAward(env.rfpId, env.bidId, {
    userId: env.buyerId,
    workspaceId: env.buyerWsId,
  });
  const sent = await service.sendContract(env.rfpId, env.templateId!, {
    userId: env.pgUserId,
    workspaceId: env.pgWsId,
  });
  expect(sent.ok).toBe(true);
}

beforeEach(async () => {
  __resetForTest();
  captureSigningError.mockClear();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => __resetForTest());

describe('ContractSigningService.onAward', () => {
  // 선정은 절대 자동 발송하지 않는다 — 어떤 계약서를 보낼지는 PG 가 딜룸에서 확인한다.
  it('always parks in awaiting_pg_template even when the PG has a linked template', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });

    const r = await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.status).toBe('awaiting_pg_template');
    expect(active?.providerRef).toBeUndefined();
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
    expect(client.sendContract).not.toHaveBeenCalled();
  });

  it('still parks when the bid pre-selected a template (the PG confirms in the deal room)', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true, preselectTemplate: true });

    const r = await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const signingRepo = await getSigningContractRepo();
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('awaiting_pg_template');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('without a template → awaiting_pg_template, no SnowSign call, notifies the PG', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: false });

    const r = await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r.ok).toBe(true);

    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.status).toBe('awaiting_pg_template');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();

    const pgNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, env.pgWsId));
    expect(pgNotifs.length).toBeGreaterThan(0);
  });

  it('is idempotent — a second onAward is a no-op', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
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
    const env = await seedAwarded({ withTemplate: true });

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

describe('ContractSigningService.sendContract', () => {
  const pgActor = (env: Env) => ({ userId: env.pgUserId, workspaceId: env.pgWsId });

  it('sends the chosen template and flips the awaiting row to sent (same contract, same round)', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const signingRepo = await getSigningContractRepo();
    const before = await signingRepo.findActiveByRfp(env.rfpId);

    const r = await service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    expect(r.ok).toBe(true);

    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.id).toBe(before!.id); // 새 행을 만들지 않는다
    expect(active?.round).toBe(1);
    expect(active?.status).toBe('sent');
    expect(active?.providerRef).toBe('ct_1');
    expect(active?.snowsignTemplateId).toBe('tmpl_1');

    const found = await signingRepo.findById(active!.id);
    expect(found?.participants).toHaveLength(2);
    expect(found!.participants.find((p) => p.role === 'buyer')?.securityMethod).toBe('easy_cert');

    const createSpy = client.createContractFromTemplate as ReturnType<typeof vi.fn>;
    expect(createSpy).toHaveBeenCalledTimes(1);
    const [snowsignTemplateId, input] = createSpy.mock.calls[0];
    expect(snowsignTemplateId).toBe('tmpl_1');
    expect(input.externalId).toBe(active!.id);
    expect(input.variables).toEqual({ 정산주기: 'D+2' });
    expect(input.participants.map((p: { role: string }) => p.role).sort()).toEqual(['PG', '구매사']);
    expect(client.sendContract).toHaveBeenCalledWith('ct_1');

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, 'signing.sent'));
    expect(audits.length).toBe(1);
  });

  it('downgrades a phone-less signer to email security', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true, buyerPhone: null });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    await service.sendContract(env.rfpId, env.templateId!, pgActor(env));

    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const found = await signingRepo.findById(active!.id);
    expect(found!.participants.find((p) => p.role === 'buyer')?.securityMethod).toBe('email');
    expect(found!.participants.find((p) => p.role === 'pg')?.securityMethod).toBe('easy_cert');
  });

  it('rejects the buyer — only the awarded PG picks its own contract', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const r = await service.sendContract(env.rfpId, env.templateId!, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  // 봉인 경계의 공격 형태 — 같은 RFP 에 응찰했다 떨어진 경쟁 PG 가 승자의 계약을 조종.
  it('rejects a PG workspace that did not win this RFP', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const loserWs = await seedPgWorkspace(db, `loser-${randomUUID().slice(0, 6)}.io`);
    const r = await service.sendContract(env.rfpId, env.templateId!, {
      userId: env.pgUserId,
      workspaceId: loserWs.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();

    const signingRepo = await getSigningContractRepo();
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('awaiting_pg_template');
  });

  it("rejects another PG workspace's template (cross-tenant guard)", async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const otherWs = await seedPgWorkspace(db, 'other.io');
    const foreignId = randomUUID();
    await db.insert(pgSigningTemplates).values({
      id: foreignId,
      workspaceId: otherWs.id,
      snowsignTemplateId: 'tmpl_foreign',
      name: '남의 계약서',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      createdBy: env.pgUserId,
    });

    const r = await service.sendContract(env.rfpId, foreignId, pgActor(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  it('rejects when the contract already left awaiting (ALREADY_SENT)', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    await service.sendContract(env.rfpId, env.templateId!, pgActor(env));

    const again = await service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('ALREADY_SENT');
    expect(client.createContractFromTemplate).toHaveBeenCalledTimes(1);
  });

  // 선정이 철회되면 그 PG 는 더 이상 이 RFP 의 당사자가 아니다 — 낙찰 PG 판정 자체가
  // awardedBidId 를 거치므로 FORBIDDEN 으로 fail-closed 된다(존재 오라클도 안 만든다).
  it('rejects when the award was reverted while the card sat open', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    await db.update(rfps).set({ status: 'sent', awardedBidId: null }).where(eq(rfps.id, env.rfpId));

    const r = await service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  // 두 PG 담당자가 동시에 누르면 SnowSign 계약이 두 건 생기고 서명 메일도 두 번 나간다.
  it('creates exactly one SnowSign contract when two members send concurrently', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const [a, b] = await Promise.all([
      service.sendContract(env.rfpId, env.templateId!, pgActor(env)),
      service.sendContract(env.rfpId, env.templateId!, pgActor(env)),
    ]);

    expect(client.createContractFromTemplate).toHaveBeenCalledTimes(1);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    if (!loser.ok) expect(loser.error).toBe('CONTRACT_BUSY');
  });

  // 발송 실패가 dead-end 를 만들면 안 된다 — 카드는 계속 눌려야 한다.
  it('leaves the contract in awaiting and releases the claim so a retry succeeds', async () => {
    const create = vi.fn(async (): Promise<{ contractId: string; status: string }> => {
      throw new SnowSignError('SNOWSIGN_NETWORK');
    });
    const client = mockClient({ createContractFromTemplate: create });
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const failed = await service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    expect(failed.ok).toBe(false);

    const signingRepo = await getSigningContractRepo();
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('awaiting_pg_template');
    expect(await signingRepo.findByRfp(env.rfpId)).toHaveLength(1);

    create.mockImplementation(async () => ({ contractId: 'ct_r', status: 'draft' }));
    const retry = await service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    expect(retry.ok).toBe(true);
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('sent');
  });

  // 발송 중 프로세스가 죽으면 클레임이 남는다 — 리스가 만료되면 다시 보낼 수 있어야
  // 계약이 영구히 잠기지 않는다. repo 레벨 리스 테스트만으로는 서비스 배선을 못 잡는다.
  it('lets a stuck claim be retried once the lease expires', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });

    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    // 발송 도중 죽은 프로세스가 남긴 오래된 클레임을 흉내낸다.
    await signingRepo.claimForSend(active!.id, new Date(Date.now() - 10 * 60_000), new Date(0));

    const r = await service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    expect(r.ok).toBe(true);
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('sent');
  });

  it('rejects when the RFP has no signing contract row at all', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    // onAward 를 부르지 않아 awaiting 행이 없다.

    const r = await service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('CONTRACT_NOT_FOUND');
    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
  });

  // 발송 클레임은 SnowSign 왕복 **전**에 잡히므로 send-vs-send 만 직렬화한다.
  // 왕복 도중 구매사가 취소하면 종결된 계약을 발송 성공이 되살릴 수 있다.
  it('does not clobber a cancel that lands during the SnowSign round-trip', async () => {
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const inFlight = new Promise<void>((r) => {
      entered = r;
    });
    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => {
        entered();
        await gate;
        return { contractId: 'ct_1', status: 'draft' };
      }),
    });
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const signingRepo = await getSigningContractRepo();
    const active = (await signingRepo.findActiveByRfp(env.rfpId))!;

    const sending = service.sendContract(env.rfpId, env.templateId!, pgActor(env));
    await inFlight; // 클레임은 잡혔고 SnowSign 왕복 중
    const canceled = await service.cancel(
      active.id,
      { userId: env.buyerId, workspaceId: env.buyerWsId },
      '중단',
    );
    expect(canceled.ok).toBe(true);

    release();
    const r = await sending;

    // 취소가 이긴다 — 발송은 성공을 주장하면 안 되고, 이미 만든 SnowSign 계약은
    // 보상 취소돼야 고아로 남지 않는다.
    expect(r.ok).toBe(false);
    expect((await signingRepo.findById(active.id))!.contract.status).toBe('canceled');
    expect(client.cancel).toHaveBeenCalledWith('ct_1', expect.any(String));
  });

  it('captures a performSend hard failure to Sentry (O2 threading)', async () => {
    const client = mockClient({
      createContractFromTemplate: vi.fn(async (): Promise<{ contractId: string; status: string }> => {
        throw new Error('boom');
      }),
    });
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    await service.sendContract(env.rfpId, env.templateId!, pgActor(env));

    expect(captureSigningError).toHaveBeenCalledWith(
      'signing.send_failed',
      expect.any(Error),
      expect.objectContaining({ rfpCode: env.rfpCode }),
    );
  });
});

describe('ContractSigningService.reconcileStatus', () => {
  const detail = (status: string, parts: SnowSignContractDetail['participants']): SnowSignContractDetail => ({
    contractId: 'ct_1',
    status,
    participants: parts,
  });

  it('applies participant-level status and moves to in_progress', async () => {
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue(detail(' COMPLETED ', []));

    await service.reconcileStatus(active!.id);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('completed');
  });

  it('logs an observability warning for an unrecognized (non-noop) provider status, without corrupting state', async () => {
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const auditRepo = await getAuditLogRepo(); // 서비스가 캡처하는 것과 동일 인스턴스(캐시)
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.providerRef).toBe('ct_1');

    (client.getContract as ReturnType<typeof vi.fn>).mockResolvedValue({
      contractId: 'ct_1',
      status: 'completed',
      participants: [],
    });

    const r = await service.reconcileByProviderRef('ct_1');
    expect(r.ok).toBe(true);
    expect(client.getContract).toHaveBeenCalledWith('ct_1');

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

describe('ContractSigningService.linkTemplate — no implicit send', () => {
  // 예전에는 템플릿을 링크하는 순간 이 PG 의 awaiting 계약이 전부 자동 발송됐다.
  // 이제 발송은 딜룸의 명시적 확인뿐이다 — 링크는 어떤 계약서도 내보내지 않는다.
  it('does not send any awaiting contract when the PG links a template', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: false });
    await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    const signingRepo = await getSigningContractRepo();
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('awaiting_pg_template');

    const linked = await service.linkTemplate(
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      {
        snowsignTemplateId: 'tmpl_link',
        name: '가맹계약서',
        roleMapping: { 구매사: 'buyer', PG: 'pg' },
      },
    );
    expect(linked.ok).toBe(true);

    expect(client.createContractFromTemplate).not.toHaveBeenCalled();
    expect(client.sendContract).not.toHaveBeenCalled();
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('awaiting_pg_template');
  });
});

describe('ContractSigningService.cancel / remind / getForActor / resend', () => {
  async function sentContract(client: SnowSignClient) {
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await startSigning(service, env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    return { service, env, signingRepo, contractId: active!.id };
  }

  it('cancel propagates to SnowSign and marks the contract canceled', async () => {
    const client = mockClient();
    const { service, env, signingRepo, contractId } = await sentContract(client);

    const r = await service.cancel(contractId, { userId: env.buyerId, workspaceId: env.buyerWsId }, '재작성');
    expect(r.ok).toBe(true);
    expect(client.cancel).toHaveBeenCalledWith('ct_1', '재작성');
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
    expect(client.remind).toHaveBeenCalledWith('ct_1');
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
      expect(asPg.contract.snowsignTemplateId).toBe('tmpl_1');
      expect(asPg.contract.providerRef).toBe('ct_1');
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
  it('resend reuses the previously-used template and starts a new round immediately', async () => {
    const client = mockClient();
    const { service, env, signingRepo } = await sentContract(client);

    const r = await service.resend(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);
    expect(client.cancel).toHaveBeenCalledTimes(1); // old round canceled
    const all = await signingRepo.findByRfp(env.rfpId);
    expect(all).toHaveLength(2);
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.round).toBe(2);
    expect(active?.status).toBe('sent');
    expect(active?.snowsignTemplateId).toBe('tmpl_1');
  });

  // 템플릿이 지워졌으면 보낼 계약서를 특정할 수 없다 — 에러 대신 대기로 되돌려
  // PG 가 딜룸에서 다시 고르게 한다(구매사가 눌러도 dead-end 가 아니다).
  it('resend degrades to a new awaiting round when the previous template was deleted', async () => {
    const client = mockClient();
    const { service, env, signingRepo } = await sentContract(client);
    const templateRepo = await getPgSigningTemplateRepo();
    expect(await templateRepo.remove(env.templateId!, env.pgWsId)).toBe(true);

    const r = await service.resend(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);

    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.round).toBe(2);
    expect(active?.status).toBe('awaiting_pg_template');
    expect(client.createContractFromTemplate).toHaveBeenCalledTimes(1); // 첫 발송 1회뿐
  });

  // 아무것도 안 보냈으면 '보냈다'고 말하면 안 된다 — 호출자가 문구를 가릴 수 있게 표시한다.
  it('resend marks the degraded park so the caller cannot claim a send happened', async () => {
    const client = mockClient();
    const { service, env } = await sentContract(client);
    const templateRepo = await getPgSigningTemplateRepo();
    await templateRepo.remove(env.templateId!, env.pgWsId);

    const r = await service.resend(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.degraded).toBe(true);
  });

  it('resend does not mark degraded when it actually sent', async () => {
    const client = mockClient();
    const { service, env } = await sentContract(client);
    const r = await service.resend(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.degraded).toBeUndefined();
  });

  it('resend refuses a previous template that now belongs to another workspace', async () => {
    const client = mockClient();
    const { service, env, signingRepo } = await sentContract(client);
    // 원 소유 링크를 지우고 같은 SnowSign 템플릿을 다른 PG 가 링크한 상태를 만든다.
    const templateRepo = await getPgSigningTemplateRepo();
    await templateRepo.remove(env.templateId!, env.pgWsId);
    const otherWs = await seedPgWorkspace(db, `hijack-${randomUUID().slice(0, 6)}.io`);
    await db.insert(pgSigningTemplates).values({
      id: randomUUID(),
      workspaceId: otherWs.id,
      snowsignTemplateId: 'tmpl_1',
      name: '남의 계약서',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      createdBy: env.pgUserId,
    });

    const r = await service.resend(env.rfpId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    expect(r.ok).toBe(true);
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('awaiting_pg_template');
    expect(client.createContractFromTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('ContractSigningService — template rename / delete', () => {
  it('renameTemplate renames within the owning workspace only', async () => {
    const service = await buildService(mockClient());
    const env = await seedAwarded({ withTemplate: true });
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    const ok = await service.renameTemplate(actor, env.templateId!, '가맹계약서 v3');
    expect(ok.ok).toBe(true);

    const templateRepo = await getPgSigningTemplateRepo();
    expect((await templateRepo.findByIdScoped(env.templateId!, env.pgWsId))?.name).toBe(
      '가맹계약서 v3',
    );
  });

  it("renameTemplate reports TEMPLATE_NOT_FOUND for another tenant's template (no existence oracle)", async () => {
    const service = await buildService(mockClient());
    const env = await seedAwarded({ withTemplate: true });
    const other = await seedAwarded({ withTemplate: true });

    const r = await service.renameTemplate(
      { userId: other.pgUserId, workspaceId: other.pgWsId },
      env.templateId!,
      '탈취',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
  });

  it('deleteTemplate unlinks it, keeps sent history, and clears the bid pre-selection', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true, preselectTemplate: true });
    await startSigning(service, env);

    const r = await service.deleteTemplate(
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      env.templateId!,
    );
    expect(r.ok).toBe(true);

    const templateRepo = await getPgSigningTemplateRepo();
    expect(await templateRepo.findByWorkspace(env.pgWsId)).toHaveLength(0);

    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.status).toBe('sent');
    expect(active?.snowsignTemplateId).toBe('tmpl_1'); // provider 측 이력 보존

    const bidRepo = await getBidRepo();
    expect(await bidRepo.findSigningTemplateId(env.bidId)).toBeNull();
  });

  it('rename 과 delete 는 각각 감사 로그를 남긴다', async () => {
    const service = await buildService(mockClient());
    const env = await seedAwarded({ withTemplate: true });
    const actor = { userId: env.pgUserId, workspaceId: env.pgWsId };

    await service.renameTemplate(actor, env.templateId!, '새 이름');
    await service.deleteTemplate(actor, env.templateId!);

    const renamed = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'signing.template_renamed'));
    const deleted = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'signing.template_deleted'));
    expect(renamed).toHaveLength(1);
    expect(deleted).toHaveLength(1);
    expect(renamed[0]!.actorWorkspaceId).toBe(env.pgWsId);
  });

  it("deleteTemplate refuses another tenant's template", async () => {
    const service = await buildService(mockClient());
    const env = await seedAwarded({ withTemplate: true });
    const other = await seedAwarded({ withTemplate: true });

    const r = await service.deleteTemplate(
      { userId: other.pgUserId, workspaceId: other.pgWsId },
      env.templateId!,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');

    const templateRepo = await getPgSigningTemplateRepo();
    expect(await templateRepo.findByIdScoped(env.templateId!, env.pgWsId)).toBeDefined();
  });
});

describe('ContractSigningService — PG template setup', () => {
  it('linkTemplate creates a template scoped to the actor workspace', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: false });

    const r = await service.linkTemplate(
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      {
        snowsignTemplateId: 'tmpl_x',
        name: '표준',
        roleMapping: { 구매사: 'buyer', PG: 'pg' },
        variableMapping: { 정산주기: 'bid.settleCycle' },
      },
    );
    expect(r.ok).toBe(true);

    const templateRepo = await getPgSigningTemplateRepo();
    const mine = await templateRepo.findByWorkspace(env.pgWsId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.name).toBe('표준');
  });

  it('linkTemplate rejects a role mapping missing a side', async () => {
    const service = await buildService(mockClient());
    const env = await seedAwarded({ withTemplate: false });
    const r = await service.linkTemplate(
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { snowsignTemplateId: 't', name: 'n', roleMapping: { 구매사: 'buyer' } },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('ROLE_MAPPING_INCOMPLETE');
  });

  it('listTemplates is scoped to the actor workspace', async () => {
    const service = await buildService(mockClient());
    const env = await seedAwarded({ withTemplate: true });
    const r = await service.listTemplates({ userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.templates).toHaveLength(1);
    // a different workspace sees none
    const other = await service.listTemplates({ userId: env.buyerId, workspaceId: env.buyerWsId });
    if (other.ok) expect(other.templates).toHaveLength(0);
  });

  it('createTemplateEmbedSession returns an iframe url', async () => {
    const client = mockClient({
      createEmbedSession: vi.fn(async () => ({
        sessionId: 's1',
        iframeUrl: 'https://app.snowsign/embed',
      })),
    });
    const service = await buildService(client);
    const r = await service.createTemplateEmbedSession({ userId: 'u', workspaceId: 'ws' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iframeUrl).toBe('https://app.snowsign/embed');
  });
});

describe('ContractSigningService — polling', () => {
  const benign = (status = 'sent') =>
    ({ contractId: 'ct_1', status, participants: [] }) as SnowSignContractDetail;

  it('pollPending reconciles only sent/in_progress contracts', async () => {
    const client = mockClient({ getContract: vi.fn(async () => benign('sent')) });
    const service = await buildService(client);
    const a = await seedAwarded({ withTemplate: true });
    const b = await seedAwarded({ withTemplate: true });
    await startSigning(service, a);
    await startSigning(service, b);

    const r = await service.pollPending(50);
    expect(r.polled).toBe(2);
    expect(client.getContract).toHaveBeenCalledTimes(2);
  });

  it('pollPending isolates a throwing contract and advances its lastPolledAt (no batch abort / starvation)', async () => {
    const client = mockClient({ getContract: vi.fn(async () => benign('sent')) });
    const service = await buildService(client);
    const a = await seedAwarded({ withTemplate: true });
    const b = await seedAwarded({ withTemplate: true });
    await startSigning(service, a);
    await startSigning(service, b);
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
    const env = await seedAwarded({ withTemplate: true });
    await startSigning(service, env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);

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
    const env = await seedAwarded({ withTemplate: true });
    await startSigning(service, env);
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
    const env2 = await seedAwarded({ withTemplate: true });
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

describe('ContractSigningService.getTemplateDetail', () => {
  it('provider getTemplate 결과를 중립 형태(name/roleNames/variables)로 반환한다', async () => {
    const client = mockClient({
      getTemplate: vi.fn(async () => ({
        templateId: 'tmpl_1',
        name: '표준 가맹계약서',
        signers: [{ roleName: '구매사' }, { roleName: 'PG' }],
        variables: [
          { name: '정산주기', label: '정산 주기', isRequired: true },
          { name: '수수료율' },
        ],
      })),
    });
    const service = await buildService(client);
    const r = await service.getTemplateDetail({ userId: 'u', workspaceId: 'ws' }, 'tmpl_1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.name).toBe('표준 가맹계약서');
      expect(r.roleNames).toEqual(['구매사', 'PG']);
      expect(r.variables).toEqual([
        { name: '정산주기', label: '정산 주기', required: true },
        { name: '수수료율', label: undefined, required: false },
      ]);
    }
    expect(client.getTemplate).toHaveBeenCalledWith('tmpl_1');
  });

  it('SnowSign 에러를 코드로 매핑한다', async () => {
    const client = mockClient({
      getTemplate: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NOT_FOUND');
      }),
    });
    const service = await buildService(client);
    const r = await service.getTemplateDetail({ userId: 'u', workspaceId: 'ws' }, 'tmpl_x');
    expect(r).toEqual({ ok: false, error: 'SNOWSIGN_NOT_FOUND' });
  });
});

describe('ContractSigningService — review hardening', () => {
  it('getForActor denies a non-party with FORBIDDEN even when no contract exists (no award-existence oracle)', async () => {
    const env = await seedAwarded({ withTemplate: true });
    const service = await buildService(mockClient());
    // No onAward — no signing contract for this RFP. A non-party must not be able
    // to distinguish "no contract" (404) from "forbidden".
    const stranger = { userId: randomUUID(), workspaceId: randomUUID() };
    const r = await service.getForActor(env.rfpId, stranger);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('linkTemplate rejects a snowsign template already linked by another workspace', async () => {
    const service = await buildService(mockClient());
    const env = await seedAwarded({ withTemplate: false });
    const otherWs = await seedPgWorkspace(db, `other-${randomUUID().slice(0, 6)}.io`);
    await db.insert(pgSigningTemplates).values({
      id: randomUUID(), workspaceId: otherWs.id, snowsignTemplateId: 'tmpl_victim', name: 'victim',
      roleMapping: { 구매사: 'buyer', PG: 'pg' }, variableMapping: {}, createdBy: env.pgUserId,
    });
    const r = await service.linkTemplate(
      { userId: env.pgUserId, workspaceId: env.pgWsId },
      { snowsignTemplateId: 'tmpl_victim', name: 'mine', roleMapping: { 구매사: 'buyer', PG: 'pg' } },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_ALREADY_LINKED');
  });

  it('getTemplateDetail denies reading a template linked by another workspace', async () => {
    const client = mockClient();
    (client.getTemplate as ReturnType<typeof vi.fn>).mockResolvedValue({
      templateId: 'tmpl_victim', name: 'victim', signers: [], variables: [],
    });
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: false });
    const otherWs = await seedPgWorkspace(db, `o2-${randomUUID().slice(0, 6)}.io`);
    await db.insert(pgSigningTemplates).values({
      id: randomUUID(), workspaceId: otherWs.id, snowsignTemplateId: 'tmpl_victim', name: 'victim',
      roleMapping: { 구매사: 'buyer', PG: 'pg' }, variableMapping: {}, createdBy: env.pgUserId,
    });
    const r = await service.getTemplateDetail({ userId: env.pgUserId, workspaceId: env.pgWsId }, 'tmpl_victim');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('reconcile mirrors a participant even when the provider echoes a different-case email', async () => {
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    (client.getContract as ReturnType<typeof vi.fn>).mockRejectedValue(new SnowSignError('SNOWSIGN_NETWORK'));
    const r = await service.reconcileStatus(active!.id);
    expect(r.ok).toBe(true);
    const after = await signingRepo.findById(active!.id);
    expect(after!.contract.status).toBe('sent');
    expect(after!.contract.lastPolledAt).toBeTruthy();
  });

  it('performSend compensating-cancels the SnowSign contract when local persist fails (no orphan)', async () => {
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient(); // createContractFromTemplate → ct_1, sendContract ok, cancel = spy
    const [signingRepo, templateRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo] =
      await Promise.all([
        getSigningContractRepo(),
        getPgSigningTemplateRepo(),
        getRfpRepo(),
        getBidRepo(),
        getUserRepo(),
        getWorkspaceRepo(),
        getAuditLogRepo(),
      ]);
    // 먼저 정상 서비스로 awaiting 행을 만든 뒤, 발송 시점의 로컬 영속만 터뜨린다.
    const seeder = new ContractSigningService(
      db, signingRepo, templateRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo, mockClient(),
    );
    await seeder.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });

    // Real repos for everything, but make the local persist throw AFTER SnowSign send.
    const throwingSigning = Object.create(signingRepo);
    throwingSigning.insertParticipants = async () => {
      throw new Error('persist boom');
    };
    const svc = new ContractSigningService(
      db,
      throwingSigning,
      templateRepo,
      rfpRepo,
      bidRepo,
      userRepo,
      wsRepo,
      auditRepo,
      client,
    );
    const r = await svc.sendContract(env.rfpId, env.templateId!, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PERSIST_FAILED');
    // The already-sent SnowSign contract must be compensating-canceled (no orphan).
    expect(client.cancel).toHaveBeenCalledWith('ct_1', expect.any(String));
  });

  it('cancel does not clobber a contract that completes mid-cancel (atomic claim, no flip-flop)', async () => {
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    const service = await buildService(client);
    await startSigning(service, env);
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

  it('performSend cancels the draft when SnowSign send fails (no unsent-draft orphan)', async () => {
    const env = await seedAwarded({ withTemplate: true });
    const client = mockClient();
    (client.sendContract as ReturnType<typeof vi.fn>).mockRejectedValue(
      new SnowSignError('SNOWSIGN_NETWORK'),
    );
    const service = await buildService(client);
    await service.onAward(env.rfpId, env.bidId, {
      userId: env.buyerId,
      workspaceId: env.buyerWsId,
    });
    const r = await service.sendContract(env.rfpId, env.templateId!, {
      userId: env.pgUserId,
      workspaceId: env.pgWsId,
    });
    expect(r.ok).toBe(false);
    // create succeeded (ct_1) but send threw → the draft must be compensating-canceled.
    expect(client.cancel).toHaveBeenCalledWith('ct_1', expect.any(String));
  });

  it('nudgeStaleAwaiting re-notifies the PG for a stuck awaiting contract and throttles repeats', async () => {
    const env = await seedAwarded({ withTemplate: false });
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
