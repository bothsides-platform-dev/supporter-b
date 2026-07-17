// contract-loader — 전자계약 RSC 로더 3종. rfp-detail-loader 컨벤션(auth-free, 이미
// 해소된 viewer 인자만 받음) 미러. PGlite + 직접 시드(contract_docs/contract_doc_signers
// 를 서비스 send() 우회 직접 insert)로 projection/ACL/mySignPending/prefill 을 검증한다.
// loadContractDocDetail 의 lazy 훅(expireIfDue/ensureFinalized)은 ContractService 를
// 내부에서 호출하므로, __setContractServiceForTest 로 "이 테스트의 pglite db 를 문
// ContractService 실 인스턴스"를 주입해(서비스 자체는 mock 이 아니라 contract.test.ts
// 의 buildService() 전례를 그대로 미러) 프로덕션 postgres-js 클라이언트를 절대 건드리지
// 않게 한다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  attachments,
  bids,
  contractDocSigners,
  contractDocs,
  contractTemplates,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAuditLogRepo,
  getBidRepo,
  getBizProfileRepo,
  getContractDocRepo,
  getContractTemplateRepo,
  getRfpRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { PARTIES_FIXTURE, TERMS_FIXTURE } from '@/lib/server/contracts/__tests__/_fixtures';
import {
  ContractService,
  __resetContractServiceForTest,
  __setContractServiceForTest,
} from '@/lib/server/services/contract';
import { CONTRACT_DEFAULT_EXPIRES_DAYS } from '@/lib/types/contract-doc';
import {
  listContractDocsForWorkspace,
  loadContractCreateData,
  loadContractDocDetail,
} from '../contract-loader';

let db: PgliteDB;

// contract.test.ts 의 buildService() 전례 — 이 테스트의 pglite db 를 문 REAL
// ContractService(mock 아님). loadContractDocDetail 의 lazy 훅이 프로덕션
// postgres-js 클라이언트(@/lib/db/client)를 절대 건드리지 않도록 매 테스트마다 주입한다.
async function injectRealContractService(): Promise<void> {
  const [docRepo, templateRepo, rfpRepo, bidRepo, wsRepo, userRepo, bizRepo, auditRepo] =
    await Promise.all([
      getContractDocRepo(),
      getContractTemplateRepo(),
      getRfpRepo(),
      getBidRepo(),
      getWorkspaceRepo(),
      getUserRepo(),
      getBizProfileRepo(),
      getAuditLogRepo(),
    ]);
  __setContractServiceForTest(
    new ContractService(db, docRepo, templateRepo, rfpRepo, bidRepo, wsRepo, userRepo, bizRepo, auditRepo),
  );
}

beforeEach(async () => {
  __resetForTest();
  __resetContractServiceForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  await injectRealContractService();
});

afterEach(() => {
  __resetContractServiceForTest();
  __resetForTest();
});

async function seedEnv() {
  const biz = await seedBizProfile(db, { bizNo: '1112223334' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사', bizProfileId: biz.id });
  const buyerAdmin = await seedUser(db, { email: 'buyer-admin@buy.com', name: '구매 담당자' });
  await seedMembership(db, buyerWs.id, buyerAdmin.id, 'admin');
  const buyerAdmin2 = await seedUser(db, { email: 'buyer-admin2@buy.com', name: '구매 관리자2' });
  await seedMembership(db, buyerWs.id, buyerAdmin2.id, 'admin');
  const buyerMember = await seedUser(db, { email: 'buyer-member@buy.com', name: '구매 멤버' });
  await seedMembership(db, buyerWs.id, buyerMember.id, 'member');

  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgAdmin = await seedUser(db, { email: 'pg-admin@toss.im', name: 'PG 담당자' });
  await seedMembership(db, pgWs.id, pgAdmin.id, 'admin');
  const pgAdmin2 = await seedUser(db, { email: 'pg-admin2@toss.im', name: 'PG 관리자2' });
  await seedMembership(db, pgWs.id, pgAdmin2.id, 'admin');
  const pgMember = await seedUser(db, { email: 'pg-member@toss.im', name: 'PG 멤버' });
  await seedMembership(db, pgWs.id, pgMember.id, 'member');

  const otherPgWs = await seedPgWorkspace(db, 'kakaopay.com');
  const otherPgUser = await seedUser(db, { email: 'other@kakaopay.com', name: '타사 PG' });
  await seedMembership(db, otherPgWs.id, otherPgUser.id, 'admin');

  const rfpId = randomUUID();
  const rfpCode = 'P-2607-0070';
  await db.insert(rfps).values({
    id: rfpId,
    code: rfpCode,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: '온라인몰 결제대행 견적',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'awarded',
    createdBy: buyerAdmin.id,
    sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    acceptedByUserId: pgAdmin.id,
    tokenHash: hashToken(generateToken()),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    submittedBy: pgAdmin.id,
    status: 'submitted',
  });
  await db.update(rfps).set({ awardedBidId: bidId }).where(eq(rfps.id, rfpId));

  return {
    rfpId,
    rfpCode,
    bidId,
    buyerWsId: buyerWs.id,
    buyerAdminId: buyerAdmin.id,
    buyerAdmin2Id: buyerAdmin2.id,
    buyerMemberId: buyerMember.id,
    pgWsId: pgWs.id,
    pgAdminId: pgAdmin.id,
    pgAdmin2Id: pgAdmin2.id,
    pgMemberId: pgMember.id,
    otherPgWsId: otherPgWs.id,
    otherPgUserId: otherPgUser.id,
  };
}

type Env = Awaited<ReturnType<typeof seedEnv>>;

async function seedDoc(
  env: Env,
  opts: {
    status?: 'sent' | 'completed' | 'declined' | 'canceled' | 'expired';
    buyerSignerId?: string;
    pgSignerId?: string;
    buyerSigned?: boolean;
    pgSigned?: boolean;
    createdBy?: string;
    expiresAt?: Date;
  } = {},
): Promise<{ docId: string; docCode: string }> {
  const docId = randomUUID();
  const docCode = `CT-2607-${Math.floor(Math.random() * 9000 + 1000)}`;
  const status = opts.status ?? 'sent';
  const completed = status === 'completed';
  await db.insert(contractDocs).values({
    id: docId,
    code: docCode,
    rfpId: env.rfpId,
    bidId: env.bidId,
    buyerWsId: env.buyerWsId,
    pgWsId: env.pgWsId,
    status,
    title: '전자계약서',
    parties: PARTIES_FIXTURE,
    termsSnapshot: TERMS_FIXTURE,
    basePdfKey: `contract-docs/${docId}/base.pdf`,
    basePdfSha256: 'a'.repeat(64),
    basePdfSize: 100,
    finalPdfKey: completed ? `contract-docs/${docId}/final.pdf` : null,
    finalPdfSha256: completed ? 'b'.repeat(64) : null,
    finalPdfSize: completed ? 120 : null,
    createdBy: opts.createdBy ?? env.pgAdminId,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 14 * 86_400_000),
    completedAt: completed ? new Date() : null,
  });
  const buyerSignerId = opts.buyerSignerId ?? env.buyerAdminId;
  const pgSignerId = opts.pgSignerId ?? env.pgAdminId;
  await db.insert(contractDocSigners).values([
    {
      id: randomUUID(),
      docId,
      party: 'buyer',
      userId: buyerSignerId,
      name: '구매 담당자',
      email: 'buyer-admin@buy.com',
      signedAt: opts.buyerSigned ? new Date() : null,
      signatureImage: opts.buyerSigned ? Buffer.from('sig') : null,
    },
    {
      id: randomUUID(),
      docId,
      party: 'pg',
      userId: pgSignerId,
      name: 'PG 담당자',
      email: 'pg-admin@toss.im',
      signedAt: opts.pgSigned ? new Date() : null,
      signatureImage: opts.pgSigned ? Buffer.from('sig') : null,
    },
  ]);
  return { docId, docCode };
}

describe('listContractDocsForWorkspace', () => {
  it('returns an empty array when the workspace has no docs', async () => {
    const env = await seedEnv();
    expect(await listContractDocsForWorkspace(env.buyerWsId)).toEqual([]);
  });

  it('buyer perspective: myParty=buyer, counterpartyName=pg ws name', async () => {
    const env = await seedEnv();
    const { docId, docCode } = await seedDoc(env);
    const rows = await listContractDocsForWorkspace(env.buyerWsId);
    expect(rows).toEqual([
      expect.objectContaining({
        id: docId,
        code: docCode,
        title: '전자계약서',
        status: 'sent',
        counterpartyName: 'toss.im',
        myParty: 'buyer',
        mySignPending: true,
      }),
    ]);
  });

  it('pg perspective: myParty=pg, counterpartyName=buyer ws name', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const rows = await listContractDocsForWorkspace(env.pgWsId);
    expect(rows).toEqual([
      expect.objectContaining({ id: docId, counterpartyName: '구매사', myParty: 'pg', mySignPending: true }),
    ]);
  });

  it('mySignPending is false once my party has signed', async () => {
    const env = await seedEnv();
    await seedDoc(env, { buyerSigned: true });
    const rows = await listContractDocsForWorkspace(env.buyerWsId);
    expect(rows[0]!.mySignPending).toBe(false);
  });

  it('mySignPending is false for a non-sent doc even if unsigned', async () => {
    const env = await seedEnv();
    await seedDoc(env, { status: 'declined' });
    const rows = await listContractDocsForWorkspace(env.buyerWsId);
    expect(rows[0]!.mySignPending).toBe(false);
  });
});

describe('loadContractDocDetail', () => {
  it('returns null when the doc does not exist', async () => {
    const env = await seedEnv();
    expect(
      await loadContractDocDetail(randomUUID(), { userId: env.buyerAdminId, workspaceId: env.buyerWsId }),
    ).toBeNull();
  });

  it('ACL: returns null for a workspace that is neither buyer nor pg', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    expect(
      await loadContractDocDetail(docId, { userId: env.otherPgUserId, workspaceId: env.otherPgWsId }),
    ).toBeNull();
  });

  it('buyer viewer: myParty/mySigner/canSign for the designated (unsigned) signer', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env); // buyer signer defaults to buyerAdminId
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdminId,
      workspaceId: env.buyerWsId,
    });
    expect(detail).not.toBeNull();
    expect(detail!.myParty).toBe('buyer');
    expect(detail!.mySigner?.userId).toBe(env.buyerAdminId);
    expect(detail!.canSign).toBe(true);
  });

  it('canSign is false for a buyer member who is not the designated signer', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env); // designated signer = buyerAdminId
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerMemberId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canSign).toBe(false);
  });

  it('canSign is false once I have already signed', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, { buyerSigned: true });
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdminId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canSign).toBe(false);
  });

  it('canDecline: true for the designated buyer signer', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdminId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canDecline).toBe(true);
  });

  it('canDecline: true for a buyer admin who is not the designated signer', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env); // designated signer = buyerAdminId, not buyerAdmin2Id
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdmin2Id,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canDecline).toBe(true);
  });

  it('canDecline: false for a buyer member who is neither the signer nor an admin', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerMemberId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canDecline).toBe(false);
  });

  it('canDecline/canReassign are false for the pg side (buyer-only actions)', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const detail = await loadContractDocDetail(docId, { userId: env.pgAdminId, workspaceId: env.pgWsId });
    expect(detail!.canDecline).toBe(false);
    expect(detail!.canReassign).toBe(false);
  });

  it('canReassign: true for a buyer admin while the buyer signer has not signed yet', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdmin2Id,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canReassign).toBe(true);
  });

  it('canReassign: false once the buyer signer has already signed', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, { buyerSigned: true });
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdmin2Id,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canReassign).toBe(false);
  });

  it('canReassign: false for a buyer member (non-admin)', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerMemberId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canReassign).toBe(false);
  });

  it('canCancel: true for the pg sender', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, { createdBy: env.pgAdminId });
    const detail = await loadContractDocDetail(docId, { userId: env.pgAdminId, workspaceId: env.pgWsId });
    expect(detail!.canCancel).toBe(true);
  });

  it('canCancel: true for a pg admin who did not send it', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, { createdBy: env.pgAdminId });
    const detail = await loadContractDocDetail(docId, { userId: env.pgAdmin2Id, workspaceId: env.pgWsId });
    expect(detail!.canCancel).toBe(true);
  });

  it('canCancel: false for a pg member who neither sent it nor is an admin', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, { createdBy: env.pgAdminId });
    const detail = await loadContractDocDetail(docId, { userId: env.pgMemberId, workspaceId: env.pgWsId });
    expect(detail!.canCancel).toBe(false);
  });

  it('canCancel is false for the buyer side (pg-only action)', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdminId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.canCancel).toBe(false);
  });

  it('all mutating flags are false on a non-active (declined) doc', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, { status: 'declined' });
    const buyerDetail = await loadContractDocDetail(docId, {
      userId: env.buyerAdminId,
      workspaceId: env.buyerWsId,
    });
    expect(buyerDetail!.canSign).toBe(false);
    expect(buyerDetail!.canDecline).toBe(false);
    expect(buyerDetail!.canReassign).toBe(false);
    const pgDetail = await loadContractDocDetail(docId, { userId: env.pgAdminId, workspaceId: env.pgWsId });
    expect(pgDetail!.canCancel).toBe(false);
  });

  it('returns signers + events alongside the doc', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env);
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdminId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.signers).toHaveLength(2);
    expect(Array.isArray(detail!.events)).toBe(true);
  });

  // 실 서비스(ContractService.expireIfDue) 를 태우는 lazy 훅 케이스 — 서비스 mock 아님.
  it('lazy hook: an overdue sent doc is expired in-place via the real ContractService', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, {
      status: 'sent',
      expiresAt: new Date(Date.now() - 1000),
    });
    const detail = await loadContractDocDetail(docId, {
      userId: env.buyerAdminId,
      workspaceId: env.buyerWsId,
    });
    expect(detail!.doc.status).toBe('expired');

    const events = await (await getContractDocRepo()).listEvents(docId);
    expect(events.some((e) => e.type === 'expired')).toBe(true);
  });
});

describe('loadContractCreateData', () => {
  it('returns null when the rfp code does not exist', async () => {
    const env = await seedEnv();
    expect(
      await loadContractCreateData('P-9999-9999', { userId: env.pgAdminId, workspaceId: env.pgWsId }),
    ).toBeNull();
  });

  it('returns null when the rfp is not awarded', async () => {
    const env = await seedEnv();
    await db.update(rfps).set({ status: 'sent', awardedBidId: null }).where(eq(rfps.id, env.rfpId));
    expect(
      await loadContractCreateData(env.rfpCode, { userId: env.pgAdminId, workspaceId: env.pgWsId }),
    ).toBeNull();
  });

  it('returns null when the viewer is a different (non-winning) pg workspace', async () => {
    const env = await seedEnv();
    expect(
      await loadContractCreateData(env.rfpCode, { userId: env.otherPgUserId, workspaceId: env.otherPgWsId }),
    ).toBeNull();
  });

  it('returns only {activeDocId} when an active (sent) doc already exists', async () => {
    const env = await seedEnv();
    const { docId } = await seedDoc(env, { status: 'sent' });
    const result = await loadContractCreateData(env.rfpCode, {
      userId: env.pgAdminId,
      workspaceId: env.pgWsId,
    });
    expect(result).toEqual({ activeDocId: docId });
  });

  it('allows a fresh send when the prior doc is declined/canceled/expired/completed', async () => {
    const env = await seedEnv();
    await seedDoc(env, { status: 'declined' });
    const result = await loadContractCreateData(env.rfpCode, {
      userId: env.pgAdminId,
      workspaceId: env.pgWsId,
    });
    expect(result).not.toHaveProperty('activeDocId');
  });

  it('builds the full create-data payload when there is no active doc', async () => {
    const env = await seedEnv();

    // ready 템플릿(첨부 있음) + 첨부 없는 템플릿(필터에서 제외돼야 함).
    const readyTemplateId = randomUUID();
    await db.insert(contractTemplates).values({
      id: readyTemplateId,
      pgWsId: env.pgWsId,
      name: '표준 계약서',
      description: '',
      createdBy: env.pgAdminId,
    });
    await db.insert(attachments).values({
      id: randomUUID(),
      contractTemplateId: readyTemplateId,
      name: 'template.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: env.pgAdminId,
      status: 'ready',
    });
    const emptyTemplateId = randomUUID();
    await db.insert(contractTemplates).values({
      id: emptyTemplateId,
      pgWsId: env.pgWsId,
      name: '첨부 없는 템플릿',
      description: '',
      createdBy: env.pgAdminId,
    });

    const result = await loadContractCreateData(env.rfpCode, {
      userId: env.pgAdminId,
      workspaceId: env.pgWsId,
    });

    expect(result).not.toBeNull();
    if (!result || 'activeDocId' in result) throw new Error('expected full payload');

    expect(result.rfp).toEqual({ code: env.rfpCode, title: '온라인몰 결제대행 견적' });
    expect(result.templates.map((t) => t.id)).toEqual([readyTemplateId]);
    expect(result.buyerPrefill).toEqual({ name: '구매사', bizNo: '1112223334', repName: '' });
    expect(result.pgPrefill).toEqual({ name: 'toss.im', bizNo: null, repName: '' });
    expect(result.buyerSignerName).toBe('구매 담당자');
    expect(result.defaultExpiresDays).toBe(CONTRACT_DEFAULT_EXPIRES_DAYS);

    const memberIds = result.pgMembers.map((m) => m.userId).sort();
    expect(memberIds).toEqual([env.pgAdmin2Id, env.pgAdminId, env.pgMemberId].sort());
    const admin = result.pgMembers.find((m) => m.userId === env.pgAdminId);
    expect(admin).toEqual({ userId: env.pgAdminId, name: 'PG 담당자', email: 'pg-admin@toss.im' });
  });
});
