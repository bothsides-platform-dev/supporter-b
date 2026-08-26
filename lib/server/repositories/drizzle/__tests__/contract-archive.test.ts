import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { bids, contractArchives, rfpInvitations, rfps, signingContracts } from '@/lib/db/schema';
import { DrizzleContractArchiveRepository } from '../contract-archive';
import { seedBuyerWorkspace, seedPgWorkspace, seedRfp, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzleContractArchiveRepository(db) };
}

/** 완료 signing_contracts 행 1개를 직접 seed (테스트 전용 최소 컬럼). */
async function seedCompletedSigning(
  db: PgliteDB,
  opts: { buyerWsId: string; createdBy: string; rfpId?: string },
): Promise<{ signingContractId: string; rfpId: string }> {
  const rfp = opts.rfpId
    ? { id: opts.rfpId }
    : await seedRfp(db, { buyerWsId: opts.buyerWsId, createdBy: opts.createdBy });
  const id = randomUUID();
  await db.insert(signingContracts).values({
    id,
    rfpId: rfp.id,
    status: 'completed',
    providerRef: `prov-${id.slice(0, 8)}`,
    createdBy: opts.createdBy,
    completedAt: new Date(),
  });
  return { signingContractId: id, rfpId: rfp.id };
}

/**
 * RFP 에 실제 낙찰 bid 를 붙여 `awardedBidId` 를 채운다(NOT NULL FK 플러밍:
 * bid 는 invitation 을 통해서만 존재). `findCompletedContractsMissingArchive`
 * 가 낙찰 포인터 유무로 후보를 거르므로(I5), "정상적으로 대기 중인" 완료
 * 계약을 만들려면 이 헬퍼가 필요하다.
 */
async function seedAwardedBidId(
  db: PgliteDB,
  opts: { rfpId: string; pgWsId: string; submittedBy: string },
): Promise<string> {
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId: opts.rfpId,
    pgWsId: opts.pgWsId,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
  });
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId: opts.rfpId,
    pgWsId: opts.pgWsId,
    invitationId: invId,
    settleCycle: 'D+2',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    status: 'submitted',
    submittedBy: opts.submittedBy,
    submittedAt: new Date(),
  });
  // awarded_consistency 체크 제약: awardedBidId 가 있으면 status 도 'awarded' 여야 한다.
  await db
    .update(rfps)
    .set({ status: 'awarded', awardedBidId: bidId })
    .where(eq(rfps.id, opts.rfpId));
  return bidId;
}

function pairRows(signingContractId: string, buyerWsId: string, pgWsId: string) {
  return [
    {
      workspaceId: buyerWsId,
      signingContractId,
      rfpCode: 'P-2608-1234',
      title: '테스트 견적',
      counterpartyName: 'PG사',
      contractedAt: new Date('2026-08-01T00:00:00Z'),
    },
    {
      workspaceId: pgWsId,
      signingContractId,
      rfpCode: 'P-2608-1234',
      title: '테스트 견적',
      counterpartyName: '구매사',
      contractedAt: new Date('2026-08-01T00:00:00Z'),
    },
  ];
}

describe('DrizzleContractArchiveRepository — 기본 CRUD', () => {
  it('insertPendingSigningPair()는 양쪽 행을 pending 으로 만들고, 재호출은 멱등이다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pg1');
    const { signingContractId } = await seedCompletedSigning(db, {
      buyerWsId: buyerWs.id,
      createdBy: buyer.id,
    });

    const rows = pairRows(signingContractId, buyerWs.id, pgWs.id);
    await repo.insertPendingSigningPair(rows);
    await repo.insertPendingSigningPair(rows); // 멱등 — 유니크 충돌 무해

    const buyerList = await repo.listByWorkspace(buyerWs.id);
    const pgList = await repo.listByWorkspace(pgWs.id);
    expect(buyerList).toHaveLength(1);
    expect(pgList).toHaveLength(1);
    expect(buyerList[0].status).toBe('pending');
    expect(buyerList[0].source).toBe('signing');
    expect(buyerList[0].counterpartyName).toBe('PG사');
    expect(pgList[0].counterpartyName).toBe('구매사');
    // Date → ISO 문자열 변환 계약.
    expect(buyerList[0].contractedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(typeof buyerList[0].createdAt).toBe('string');
  });

  it('listByWorkspace()는 타 워크스페이스 행을 절대 섞지 않는다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const wsA = await seedBuyerWorkspace(db);
    const wsB = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pg2');
    const { signingContractId } = await seedCompletedSigning(db, {
      buyerWsId: wsA.id,
      createdBy: buyer.id,
    });
    await repo.insertPendingSigningPair(pairRows(signingContractId, wsA.id, pgWs.id));

    expect(await repo.listByWorkspace(wsB.id)).toHaveLength(0);
  });

  it('RFP 삭제 → signing CASCADE 사망 후에도 보관함 행이 스냅샷과 함께 남는다(SET NULL)', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pg3');
    const { signingContractId, rfpId } = await seedCompletedSigning(db, {
      buyerWsId: buyerWs.id,
      createdBy: buyer.id,
    });
    await repo.insertPendingSigningPair(pairRows(signingContractId, buyerWs.id, pgWs.id));

    await db.delete(rfps).where(eq(rfps.id, rfpId)); // signing_contracts 도 CASCADE 로 죽는다

    const list = await repo.listByWorkspace(buyerWs.id);
    expect(list).toHaveLength(1);
    expect(list[0].signingContractId).toBeNull();
    expect(list[0].title).toBe('테스트 견적');
    expect(list[0].rfpCode).toBe('P-2608-1234');
  });

  it('findById()는 미존재 id 에 undefined', async () => {
    const { repo } = await setup();
    expect(await repo.findById(randomUUID())).toBeUndefined();
  });

  it('listByWorkspace()는 coalesce(contracted_at, created_at) desc 로 정렬한다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.sort1');

    // contractedAt 이 옛 날짜인 signing 사본.
    const { signingContractId } = await seedCompletedSigning(db, {
      buyerWsId: buyerWs.id,
      createdBy: buyer.id,
    });
    await repo.insertPendingSigningPair([
      {
        workspaceId: buyerWs.id,
        signingContractId,
        rfpCode: 'P-2601-0001',
        title: '옛 계약',
        counterpartyName: 'PG사',
        contractedAt: new Date('2020-01-01T00:00:00Z'),
      },
      {
        workspaceId: pgWs.id,
        signingContractId,
        rfpCode: 'P-2601-0001',
        title: '옛 계약',
        counterpartyName: '구매사',
        contractedAt: new Date('2020-01-01T00:00:00Z'),
      },
    ]);

    // contractedAt 없는 업로드 — created_at(현재)로 폴백해 위 옛 계약보다 최신으로 정렬돼야 한다.
    await repo.insertPendingUpload({
      id: randomUUID(),
      workspaceId: buyerWs.id,
      title: '최근 업로드',
      documentKey: 'k1',
      documentName: 'doc.pdf',
      documentSize: 100,
      createdBy: buyer.id,
    });

    const list = await repo.listByWorkspace(buyerWs.id);
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('최근 업로드');
    expect(list[1].title).toBe('옛 계약');
  });

  it('findPendingSigningGroups()는 signing_contract_id 가 SET NULL 된 고아 pending 을 그룹에서 제외하고, LIMIT 슬롯을 먹지 않는다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.orphan1');

    // 고아 pending: RFP 삭제 → signing_contracts CASCADE 사망 → signing_contract_id SET NULL.
    const orphan = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    await repo.insertPendingSigningPair(pairRows(orphan.signingContractId, buyerWs.id, pgWs.id));
    await db.delete(rfps).where(eq(rfps.id, orphan.rfpId));

    // 정상 pending 1건.
    const valid = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    await repo.insertPendingSigningPair(pairRows(valid.signingContractId, buyerWs.id, pgWs.id));

    // limit=1 이어도 고아가 슬롯을 먹지 않아 정상 계약이 잡혀야 한다.
    const groups = await repo.findPendingSigningGroups(1);
    expect(groups).toHaveLength(1);
    expect(groups[0].signingContractId).toBe(valid.signingContractId);
  });

  it('failOrphanedSigningPending()는 고아 pending 을 failed 로 전이하고 처리 행 수를 반환한다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.orphan2');

    const orphan = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    await repo.insertPendingSigningPair(pairRows(orphan.signingContractId, buyerWs.id, pgWs.id));
    await db.delete(rfps).where(eq(rfps.id, orphan.rfpId));

    const n = await repo.failOrphanedSigningPending(new Date());
    expect(n).toBe(2); // buyer + pg 양쪽 행

    const [buyerRow] = await repo.listByWorkspace(buyerWs.id);
    const [pgRow] = await repo.listByWorkspace(pgWs.id);
    expect(buyerRow.status).toBe('failed');
    expect(pgRow.status).toBe('failed');
  });
});

describe('DrizzleContractArchiveRepository — 파이프라인', () => {
  it('findPendingSigningGroups()는 계약 단위로 묶어 오래된 순으로 돌려준다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pipe1');
    const a = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    const b = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    await repo.insertPendingSigningPair(pairRows(a.signingContractId, buyerWs.id, pgWs.id));
    await repo.insertPendingSigningPair(pairRows(b.signingContractId, buyerWs.id, pgWs.id));

    // created_at 이 둘 다 now() 디폴트라 동률(간헐 flake)일 수 있다 — a<b 를
    // 명시 시각으로 결정적으로 고정한다.
    await db
      .update(contractArchives)
      .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(contractArchives.signingContractId, a.signingContractId));
    await db
      .update(contractArchives)
      .set({ createdAt: new Date('2026-01-02T00:00:00Z') })
      .where(eq(contractArchives.signingContractId, b.signingContractId));

    const groups = await repo.findPendingSigningGroups(10);
    expect(groups).toHaveLength(2); // 행은 4개지만 계약은 2개
    expect(groups.map((g) => g.signingContractId)).toContain(a.signingContractId);

    const limited = await repo.findPendingSigningGroups(1);
    expect(limited).toHaveLength(1);
    expect(limited[0].signingContractId).toBe(a.signingContractId); // a 가 먼저 insert 됨 — 오래된 순
  });

  it('markSigningReady()는 같은 계약의 두 행을 함께 ready 로 만든다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pipe2');
    const { signingContractId } = await seedCompletedSigning(db, {
      buyerWsId: buyerWs.id,
      createdBy: buyer.id,
    });
    await repo.insertPendingSigningPair(pairRows(signingContractId, buyerWs.id, pgWs.id));

    await repo.markSigningReady(signingContractId, {
      documentKey: `contract-archives/signing/${signingContractId}/document.pdf`,
      documentName: '계약서.pdf',
      documentSize: 1234,
      auditKey: `contract-archives/signing/${signingContractId}/audit.pdf`,
      auditName: '감사추적인증서.pdf',
    });

    for (const ws of [buyerWs.id, pgWs.id]) {
      const [row] = await repo.listByWorkspace(ws);
      expect(row.status).toBe('ready');
      expect(row.documentKey).toContain(signingContractId);
      expect(row.auditKey).toContain('audit.pdf');
    }
    // 하이드레이션 대상에서 빠진다
    expect(await repo.findPendingSigningGroups(10)).toHaveLength(0);
  });

  it('markSigningReady()는 이미 ready 인 행을 재호출로 덮어쓰지 않는다 (pending 전용 가드)', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pipe2b');
    const { signingContractId } = await seedCompletedSigning(db, {
      buyerWsId: buyerWs.id,
      createdBy: buyer.id,
    });
    await repo.insertPendingSigningPair(pairRows(signingContractId, buyerWs.id, pgWs.id));

    await repo.markSigningReady(signingContractId, {
      documentKey: 'first-key.pdf',
      documentName: '계약서.pdf',
      documentSize: 1,
      auditKey: 'first-audit.pdf',
      auditName: '감사추적.pdf',
    });
    // 재호출 — pending 필터가 없으면 이미 ready 인 행을 덮어쓴다.
    await repo.markSigningReady(signingContractId, {
      documentKey: 'second-key.pdf',
      documentName: '계약서2.pdf',
      documentSize: 2,
      auditKey: 'second-audit.pdf',
      auditName: '감사추적2.pdf',
    });

    const [row] = await repo.listByWorkspace(buyerWs.id);
    expect(row.documentKey).toBe('first-key.pdf'); // 재호출은 무시된다
  });

  it('recordSigningAttempt()는 두 행의 attempts 를 함께 올리고, markSigningFailed()는 failed 로 보낸다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pipe3');
    const { signingContractId } = await seedCompletedSigning(db, {
      buyerWsId: buyerWs.id,
      createdBy: buyer.id,
    });
    await repo.insertPendingSigningPair(pairRows(signingContractId, buyerWs.id, pgWs.id));

    await repo.recordSigningAttempt(signingContractId, new Date());
    const [group] = await repo.findPendingSigningGroups(10);
    expect(group.attempts).toBe(1); // max(attempts) — 한 행만 올라도 통과하는 vacuous 소지, 아래에서 양행 직접 확인
    const [buyerAfterAttempt] = await repo.listByWorkspace(buyerWs.id);
    const [pgAfterAttempt] = await repo.listByWorkspace(pgWs.id);
    expect(buyerAfterAttempt.attempts).toBe(1);
    expect(pgAfterAttempt.attempts).toBe(1);

    await repo.markSigningFailed(signingContractId, new Date());
    expect(await repo.findPendingSigningGroups(10)).toHaveLength(0);
    const [row] = await repo.listByWorkspace(buyerWs.id);
    expect(row.status).toBe('failed');
  });

  it('findCompletedContractsMissingArchive()는 보관함 행이 없는 완료 계약만 집는다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pipe4');
    const archived = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    const missing = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    // 낙찰 포인터가 있어야 "정상적으로 대기 중"인 후보다(I5).
    await seedAwardedBidId(db, { rfpId: missing.rfpId, pgWsId: pgWs.id, submittedBy: buyer.id });
    await repo.insertPendingSigningPair(pairRows(archived.signingContractId, buyerWs.id, pgWs.id));

    const ids = await repo.findCompletedContractsMissingArchive(10);
    expect(ids).toContain(missing.signingContractId);
    expect(ids).not.toContain(archived.signingContractId);
  });

  it('findCompletedContractsMissingArchive()는 낙찰 bid 가 없는(awardedBidId null) 완료 계약은 후보에서 제외한다', async () => {
    const { db, repo } = await setup();
    const buyer = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    // awardedBidId 를 세팅하지 않는다 — RFP 재요청/삭제 등으로 낙찰 포인터가
    // 소실된 상태를 흉내. createPendingForContract 는 이 경우 매번
    // RFP_NOT_FOUND 로 실패하므로, 후보에 계속 남으면 백필 예산을 영원히
    // 뺏긴다(I5) — 이 쿼리가 애초에 후보로 집지 않아야 한다.
    const noAward = await seedCompletedSigning(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });

    const ids = await repo.findCompletedContractsMissingArchive(10);
    expect(ids).not.toContain(noAward.signingContractId);
  });

  it('업로드 행: insert→countUploadsByWorkspace→markUploadReady→removeUpload 라이프사이클', async () => {
    const { db, repo } = await setup();
    const user = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const id = randomUUID();
    await repo.insertPendingUpload({
      id,
      workspaceId: ws.id,
      title: '외부 계약서',
      documentKey: `contract-archives/upload/${id}`,
      documentName: '외부계약.pdf',
      documentSize: 999,
      createdBy: user.id,
    });

    expect(await repo.countUploadsByWorkspace(ws.id)).toBe(1);
    expect(await repo.markUploadReady(id)).toBe(true);
    expect(await repo.markUploadReady(id)).toBe(false); // 이미 ready — 0행
    const [row] = await repo.listByWorkspace(ws.id);
    expect(row.status).toBe('ready');
    expect(row.source).toBe('upload');

    await repo.removeUpload(id);
    expect(await repo.listByWorkspace(ws.id)).toHaveLength(0);
  });

  it('deleteStaleUploadPending()는 upload-pending 만 지우고, signing-pending·ready 전이분·cutoff 이후 생성분은 절대 건드리지 않는다', async () => {
    const { db, repo } = await setup();
    const user = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'arch.pipe5');
    const { signingContractId } = await seedCompletedSigning(db, {
      buyerWsId: buyerWs.id,
      createdBy: user.id,
    });
    await repo.insertPendingSigningPair(pairRows(signingContractId, buyerWs.id, pgWs.id));

    const cutoff = new Date(Date.now() - 60_000); // "이 시각보다 오래된 pending" 만 대상

    // ① 스윕 대상: pending + cutoff 이전 생성.
    const staleId = randomUUID();
    await repo.insertPendingUpload({
      id: staleId,
      workspaceId: buyerWs.id,
      title: '버려진 업로드',
      documentKey: `contract-archives/upload/${staleId}`,
      documentName: 'x.pdf',
      documentSize: 10,
      createdBy: user.id,
    });
    await db
      .update(contractArchives)
      .set({ createdAt: new Date(Date.now() - 3600_000) }) // cutoff 보다 오래됨
      .where(eq(contractArchives.id, staleId));

    // ② 생존 케이스 — ready 전이(cutoff 이전 생성이어도 status 필터가 막아야 한다).
    const readyId = randomUUID();
    await repo.insertPendingUpload({
      id: readyId,
      workspaceId: buyerWs.id,
      title: '완료된 업로드',
      documentKey: `contract-archives/upload/${readyId}`,
      documentName: 'ready.pdf',
      documentSize: 10,
      createdBy: user.id,
    });
    await db
      .update(contractArchives)
      .set({ createdAt: new Date(Date.now() - 3600_000) }) // stale 과 동일하게 오래됨
      .where(eq(contractArchives.id, readyId));
    await repo.markUploadReady(readyId);

    // ③ 생존 케이스 — cutoff 이후 생성(pending 이어도 cutoff 필터가 막아야 한다).
    const recentId = randomUUID();
    await repo.insertPendingUpload({
      id: recentId,
      workspaceId: buyerWs.id,
      title: '방금 올린 업로드',
      documentKey: `contract-archives/upload/${recentId}`,
      documentName: 'recent.pdf',
      documentSize: 10,
      createdBy: user.id,
    });

    const swept = await repo.deleteStaleUploadPending(cutoff, 50);
    expect(swept.map((s) => s.id)).toEqual([staleId]);
    expect(swept[0].documentKey).toBe(`contract-archives/upload/${staleId}`);

    const remainingIds = (await repo.listByWorkspace(buyerWs.id)).map((r) => r.id);
    expect(remainingIds).toContain(readyId);
    expect(remainingIds).toContain(recentId);
    expect(remainingIds).not.toContain(staleId);
    // signing pending 생존
    expect(await repo.findPendingSigningGroups(10)).toHaveLength(1);
  });
  // ── CHECK 제약 ────────────────────────────────────────────────────────────
  //
  // `source`·`status` 는 pgEnum 이 아니라 text 다 — CHECK 가 어휘 밖 값을 막는
  // **유일한** 방어다. 뚫리면 그 행이 `findPendingSigningGroups`,
  // `deleteStaleUploadPending`, 스윕의 `source='upload'` 필터에서 한꺼번에 빠진다.
  // (`pg-signing-template.test.ts` 가 같은 이유로 CHECK 를 전부 못박는 선례다.)
  it('CHECK: 어휘 밖 source 는 거부한다', async () => {
    const { db } = await setup();
    const user = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    await expect(
      db.insert(contractArchives).values({
        id: randomUUID(),
        workspaceId: buyerWs.id,
        source: 'signing_v2',
        title: 'x',
        status: 'pending',
        createdBy: user.id,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('CHECK: 어휘 밖 status 는 거부한다', async () => {
    const { db } = await setup();
    const user = await seedUser(db);
    const buyerWs = await seedBuyerWorkspace(db);
    await expect(
      db.insert(contractArchives).values({
        id: randomUUID(),
        workspaceId: buyerWs.id,
        source: 'upload',
        title: 'x',
        status: 'hydrating',
        createdBy: user.id,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});
