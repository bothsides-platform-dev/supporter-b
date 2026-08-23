import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getBidRepo,
  getContractArchiveRepo,
  getRfpRepo,
  getSigningContractRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { bids, rfpInvitations, rfps, signingContracts } from '@/lib/db/schema';
import type { SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { Storage } from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import { ContractArchiveService } from '../contract-archive';

const { captureSigningError } = vi.hoisted(() => ({ captureSigningError: vi.fn() }));
vi.mock('@/lib/server/signing/observability', () => ({ captureSigningError }));

let db: PgliteDB;
let storage: InMemoryStorage;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  storage = new InMemoryStorage();
  vi.unstubAllGlobals();
});

afterEach(() => {
  __resetForTest();
  vi.unstubAllGlobals();
});

function fakeSnowSign(overrides: Partial<SnowSignClient> = {}): SnowSignClient {
  return {
    downloadUrl: vi.fn(async () => ({
      downloadUrl: 'https://sign.example/doc.pdf',
      filename: '완료본.pdf',
    })),
    auditCertificateUrl: vi.fn(async () => ({
      downloadUrl: 'https://sign.example/audit.pdf',
      filename: '인증서.pdf',
    })),
    ...overrides,
  } as unknown as SnowSignClient;
}

async function buildService(
  client: SnowSignClient = fakeSnowSign(),
  getStorageFn: () => Storage = () => storage,
): Promise<ContractArchiveService> {
  const [archiveRepo, signingRepo, rfpRepo, bidRepo, wsRepo] = await Promise.all([
    getContractArchiveRepo(),
    getSigningContractRepo(),
    getRfpRepo(),
    getBidRepo(),
    getWorkspaceRepo(),
  ]);
  return new ContractArchiveService(archiveRepo, signingRepo, rfpRepo, bidRepo, wsRepo, client, getStorageFn);
}

/**
 * 스토리지가 절대 해석되면 안 되는 경로(행 생성만 하는 createPendingForContract)
 * 용 가짜 — 호출되는 순간 즉시 던져 "지연 해석이 실제로 지켜지는지"를 회귀 고정한다.
 */
function unreachableStorage(): Storage {
  throw new Error('storage resolved — createPendingForContract must never touch storage');
}

/** awarded RFP + bid + completed signing 계약 한 벌 seed. */
async function seedCompletedDeal() {
  // 이름을 리터럴로 명시 통제 — 교차 스냅샷(buyer 행엔 PG 이름, PG 행엔 buyer
  // 이름) 을 정확일치로 검증하려면 호출부가 두 이름을 알고 있어야 한다.
  const buyerWsName = `구매사-${randomUUID().slice(0, 6)}`;
  const pgWsName = `PG사-${randomUUID().slice(0, 6)}`;
  const buyer = await seedUser(db, { email: `b-${randomUUID().slice(0, 6)}@x.com` });
  const buyerWs = await seedBuyerWorkspace(db, { name: buyerWsName });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pgUser = await seedUser(db, { email: `p-${randomUUID().slice(0, 6)}@x.com` });
  const pgWs = await seedPgWorkspace(db, `arch-${randomUUID().slice(0, 6)}.io`, { name: pgWsName });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
  // bids.invitation_id 는 NOT NULL FK — 견적 제출은 항상 초대를 통한다.
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
  const contractId = randomUUID();
  await db.insert(signingContracts).values({
    id: contractId,
    rfpId: rfp.id,
    status: 'completed',
    providerRef: `prov-${contractId.slice(0, 8)}`,
    createdBy: buyer.id,
    completedAt: new Date('2026-08-01T09:00:00Z'),
  });
  return {
    buyerWsId: buyerWs.id,
    buyerWsName,
    pgWsId: pgWs.id,
    pgWsName,
    rfpId: rfp.id,
    rfpCode: rfp.code,
    contractId,
  };
}

describe('ContractArchiveService.createPendingForContract', () => {
  it('완료 계약에 양쪽 워크스페이스 pending 행을 스냅샷과 함께 만든다 (재호출 멱등)', async () => {
    const env = await seedCompletedDeal();
    // 행 생성 경로는 스토리지를 절대 해석하지 않는다 — 해석되면 즉시 던진다.
    const service = await buildService(fakeSnowSign(), unreachableStorage);

    const r1 = await service.createPendingForContract(env.contractId);
    expect(r1.ok).toBe(true);
    const r2 = await service.createPendingForContract(env.contractId);
    expect(r2.ok).toBe(true); // 멱등

    const archiveRepo = await getContractArchiveRepo();
    const buyerList = await archiveRepo.listByWorkspace(env.buyerWsId);
    const pgList = await archiveRepo.listByWorkspace(env.pgWsId);
    expect(buyerList).toHaveLength(1);
    expect(pgList).toHaveLength(1);
    expect(buyerList[0].rfpCode).toBe(env.rfpCode);
    expect(buyerList[0].status).toBe('pending');
    expect(buyerList[0].contractedAt).toBe('2026-08-01T09:00:00.000Z');
    // 상대방 스냅샷: buyer 행엔 PG 워크스페이스명, PG 행엔 구매사 워크스페이스명 — 정확일치로 교차 고정.
    expect(buyerList[0].counterpartyName).toBe(env.pgWsName);
    expect(pgList[0].counterpartyName).toBe(env.buyerWsName);
  });

  it('완료 아닌 계약은 거부한다', async () => {
    const env = await seedCompletedDeal();
    await db
      .update(signingContracts)
      .set({ status: 'sent', completedAt: null })
      .where(eq(signingContracts.id, env.contractId));
    const service = await buildService(fakeSnowSign(), unreachableStorage);

    const r = await service.createPendingForContract(env.contractId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NOT_COMPLETED');
  });

  it('미존재 계약은 NOT_COMPLETED', async () => {
    const service = await buildService(fakeSnowSign(), unreachableStorage);
    const r = await service.createPendingForContract(randomUUID());
    expect(r.ok).toBe(false);
  });
});

describe('ContractArchiveService.hydratePending / backfillMissing', () => {
  function stubFetchPdf(bytes = 2048) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array(bytes).fill(37), {
          status: 200,
          headers: { 'content-length': String(bytes) },
        }),
      ),
    );
  }

  it('pending 계약을 받아 두 문서를 R2 에 저장하고 두 행을 ready 로 만든다', async () => {
    const env = await seedCompletedDeal();
    const service = await buildService();
    await service.createPendingForContract(env.contractId);
    stubFetchPdf();

    const r = await service.hydratePending();
    expect(r.ok && r.hydrated).toBe(1);

    const archiveRepo = await getContractArchiveRepo();
    const [row] = await archiveRepo.listByWorkspace(env.buyerWsId);
    expect(row.status).toBe('ready');
    expect(row.documentName).toBe('완료본.pdf');
    expect(row.auditName).toBe('인증서.pdf');
    expect(row.documentSize).toBe(2048);
    // 스토리지에 실제 객체가 있다
    const head = await storage.head(`contract-archives/signing/${env.contractId}/document.pdf`);
    expect(head.size).toBe(2048);
    const auditHead = await storage.head(`contract-archives/signing/${env.contractId}/audit.pdf`);
    expect(auditHead.size).toBe(2048);
  });

  it('provider fetch 실패는 attempts 를 올리고, 상한 도달 시 failed + Sentry', async () => {
    const env = await seedCompletedDeal();
    const service = await buildService(
      fakeSnowSign({
        downloadUrl: vi.fn(async () => {
          throw new Error('boom');
        }),
      }),
    );
    await service.createPendingForContract(env.contractId);
    const archiveRepo = await getContractArchiveRepo();

    // MAX_HYDRATE_ATTEMPTS(10)회 반복 — 9회는 재시도 기록, 10회째 failed.
    // 경계값 자체를 고정: 9회차까지는 여전히 pending + attempts=9 이고
    // Sentry 는 아직 호출되지 않아야 한다(최종 상태만 보면 상한이 1이어도
    // 통과하는 vacuous 를 막는다).
    for (let i = 0; i < 9; i += 1) {
      await service.hydratePending();
    }
    const [midRow] = await archiveRepo.listByWorkspace(env.buyerWsId);
    expect(midRow.status).toBe('pending');
    expect(midRow.attempts).toBe(9);
    expect(captureSigningError).not.toHaveBeenCalled();

    await service.hydratePending(); // 10회째 — 상한 도달
    expect(await archiveRepo.findPendingSigningGroups(10)).toHaveLength(0);
    const [row] = await archiveRepo.listByWorkspace(env.buyerWsId);
    expect(row.status).toBe('failed');
    expect(captureSigningError).toHaveBeenCalledWith(
      'archive.hydrate_failed_final',
      expect.anything(),
      expect.objectContaining({ contractId: env.contractId }),
    );
  });

  it('signing 행이 죽은 pending 은 즉시 failed — 루프 전 스윕(orphanedRows)이 처리하고 루프 안 failed 는 0', async () => {
    const env = await seedCompletedDeal();
    const service = await buildService();
    await service.createPendingForContract(env.contractId);
    await db.delete(rfps).where(eq(rfps.id, env.rfpId)); // CASCADE 로 signing 행 사망 → signing_contract_id SET NULL

    const r = await service.hydratePending();
    // 고아 정리는 루프 밖 failOrphanedSigningPending 이 행 단위로 처리한다 —
    // 한 계약 = buyer/pg 양쪽 2행. 루프 안 실패(failed)와는 별도 카운터다.
    expect(r.ok && r.orphanedRows).toBe(2);
    expect(r.ok && r.failed).toBe(0);
    const archiveRepo = await getContractArchiveRepo();
    const [buyerRow] = await archiveRepo.listByWorkspace(env.buyerWsId);
    const [pgRow] = await archiveRepo.listByWorkspace(env.pgWsId);
    expect(buyerRow.status).toBe('failed');
    expect(pgRow.status).toBe('failed');
  });

  it('캡 초과 문서(content-length 사전 게이트)는 attempts 를 올린다 (재시도 경로)', async () => {
    const env = await seedCompletedDeal();
    const service = await buildService();
    await service.createPendingForContract(env.contractId);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(31 * 1024 * 1024) },
        }),
      ),
    );

    await service.hydratePending();
    const archiveRepo = await getContractArchiveRepo();
    const [group] = await archiveRepo.findPendingSigningGroups(10);
    expect(group.attempts).toBe(1); // 재시도 경로
  });

  it('content-length 없는 스트리밍 응답도 실바이트가 캡을 넘으면 조기 중단하고 attempts 를 올린다', async () => {
    const env = await seedCompletedDeal();
    const service = await buildService();
    await service.createPendingForContract(env.contractId);

    // content-length 헤더 없음 → 사전 게이트(declared=0)를 그냥 통과 →
    // 스트리밍 누적 중 캡(30MB)을 넘겨야 한다. 8MB 청크 4개(32MB)면 충분.
    const chunk = new Uint8Array(8 * 1024 * 1024).fill(1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(chunk);
              controller.enqueue(chunk);
              controller.enqueue(chunk);
              controller.enqueue(chunk);
              controller.close();
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await service.hydratePending();
    const archiveRepo = await getContractArchiveRepo();
    const [group] = await archiveRepo.findPendingSigningGroups(10);
    expect(group.attempts).toBe(1); // 재시도 경로 — 스트리밍 캡 초과도 attempts 를 올린다
  });

  it('backfillMissing()은 행이 없는 완료 계약에 행을 만든다 (백필 = 자가치유)', async () => {
    const env = await seedCompletedDeal();
    const service = await buildService();

    const r = await service.backfillMissing();
    expect(r.ok && r.created).toBe(1);
    const archiveRepo = await getContractArchiveRepo();
    expect(await archiveRepo.listByWorkspace(env.buyerWsId)).toHaveLength(1);
    // 재실행은 0 — 멱등
    const r2 = await service.backfillMissing();
    expect(r2.ok && r2.created).toBe(0);
  });
});
