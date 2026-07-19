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
} from '@/lib/db/schema';
import type {
  SnowSignClient,
  SnowSignContractDetail,
} from '@/lib/server/signing/snowsign-client';
import { ContractSigningService } from '../contract-signing';

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
};

async function seedAwarded(opts: {
  withTemplate?: boolean;
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

  if (opts.withTemplate) {
    await db.insert(pgSigningTemplates).values({
      id: randomUUID(),
      workspaceId: pgWs.id,
      snowsignTemplateId: 'tmpl_1',
      name: '표준 가맹계약서',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      variableMapping: { 정산주기: 'bid.settleCycle' },
      isDefault: true,
      createdBy: pgUser.id,
    });
  }

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

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => __resetForTest());

describe('ContractSigningService.onAward', () => {
  it('with a linked template → creates a sent contract, calls SnowSign create+send with external_id', async () => {
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
    expect(active?.status).toBe('sent');
    expect(active?.providerRef).toBe('ct_1');
    expect(active?.snowsignTemplateId).toBe('tmpl_1');

    const found = await signingRepo.findById(active!.id);
    expect(found?.participants).toHaveLength(2);
    const buyerP = found!.participants.find((p) => p.role === 'buyer');
    expect(buyerP?.securityMethod).toBe('easy_cert'); // phone present

    // SnowSign create-contract: external_id = contract id (멱등), variables resolved
    const createSpy = client.createContractFromTemplate as ReturnType<typeof vi.fn>;
    expect(createSpy).toHaveBeenCalledTimes(1);
    const [templateId, input] = createSpy.mock.calls[0];
    expect(templateId).toBe('tmpl_1');
    expect(input.externalId).toBe(active!.id);
    expect(input.variables).toEqual({ 정산주기: 'D+2' });
    const roles = input.participants.map((p: { role: string }) => p.role).sort();
    expect(roles).toEqual(['PG', '구매사']);
    expect(client.sendContract).toHaveBeenCalledWith('ct_1');

    // audit + notify
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, 'signing.sent'));
    expect(audits.length).toBe(1);
    const notifs = await db.select().from(notifications);
    expect(notifs.length).toBeGreaterThan(0);
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

    expect(client.createContractFromTemplate).toHaveBeenCalledTimes(1);
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

  it('downgrades a phone-less signer to email security', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true, buyerPhone: null });

    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const signingRepo = await getSigningContractRepo();
    const active = await signingRepo.findActiveByRfp(env.rfpId);
    const found = await signingRepo.findById(active!.id);
    expect(found!.participants.find((p) => p.role === 'buyer')?.securityMethod).toBe('email');
    expect(found!.participants.find((p) => p.role === 'pg')?.securityMethod).toBe('easy_cert');
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
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
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
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
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
});

describe('ContractSigningService.onTemplateReady', () => {
  it('sends an awaiting contract once the PG links a template', async () => {
    const client = mockClient();
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: false });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
    const signingRepo = await getSigningContractRepo();
    expect((await signingRepo.findActiveByRfp(env.rfpId))?.status).toBe('awaiting_pg_template');

    await db.insert(pgSigningTemplates).values({
      id: randomUUID(),
      workspaceId: env.pgWsId,
      snowsignTemplateId: 'tmpl_link',
      name: 't',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      variableMapping: {},
      isDefault: true,
      createdBy: env.pgUserId,
    });

    const r = await service.onTemplateReady(env.pgWsId, { userId: env.pgUserId, workspaceId: env.pgWsId });
    expect(r.ok).toBe(true);

    const active = await signingRepo.findActiveByRfp(env.rfpId);
    expect(active?.status).toBe('sent');
    expect(active?.providerRef).toBe('ct_1');
    expect(active?.snowsignTemplateId).toBe('tmpl_link');
    const found = await signingRepo.findById(active!.id);
    expect(found?.participants).toHaveLength(2);
    expect(client.createContractFromTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('ContractSigningService.cancel / remind / getForActor / resend', () => {
  async function sentContract(client: SnowSignClient) {
    const service = await buildService(client);
    const env = await seedAwarded({ withTemplate: true });
    await service.onAward(env.rfpId, env.bidId, { userId: env.buyerId, workspaceId: env.buyerWsId });
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

  it('resend cancels the active contract and starts a new round', async () => {
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
  });
});
