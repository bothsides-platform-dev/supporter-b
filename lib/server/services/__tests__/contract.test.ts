// ContractService — 전자계약 발송·서명·완료·반려·회수·재지정·검증·만료.
// rfp.test.ts 의 PGlite 전례: createPgliteDb + __useDrizzleWithDbForTest + _seed,
// notifications/outbox_entries/audit_logs/contract_docs 행 assert. storage 는
// InMemoryStorage 주입(bid.test.ts 전례). composeBasePdf/composeFinalPdf 는 실
// PDF 파이프라인(폰트 서브셋)을 태우므로 makeKoreanTemplate 픽스처를 쓴다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAttachmentRepo,
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
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { makeKoreanTemplate, PNG_1X1 } from '@/lib/server/contracts/__tests__/_fixtures';
import { sha256Hex } from '@/lib/server/contracts/hash';
import {
  auditLogs,
  bids,
  contractDocEvents,
  contractDocSigners,
  contractDocs,
  notifications,
  outboxEntries,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import {
  ContractService,
  __resetContractServiceForTest,
  __setContractServiceForTest,
  getContractService,
  type SendContractInput,
} from '../contract';
import { CONTRACT_CONSENT_TEXT_VERSION } from '@/lib/types/contract-doc';
import type { ContractPartiesV1 } from '@/lib/types/contract-doc';
import type { PgliteDB } from '@/lib/db/client-pglite';
import type { Actor } from '../types';

let db: PgliteDB;
let storage: InMemoryStorage;
let svc: ContractService;

async function buildService(): Promise<ContractService> {
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
  return new ContractService(
    db,
    docRepo,
    templateRepo,
    rfpRepo,
    bidRepo,
    wsRepo,
    userRepo,
    bizRepo,
    auditRepo,
  );
}

const META = { ip: '203.0.113.7', userAgent: 'vitest-agent' };

const PARTIES: ContractPartiesV1 = {
  _v: 1,
  buyer: { name: '주식회사 서포트비', repName: '김구매', bizNo: '123-45-67890' },
  pg: { name: '나이스페이먼츠 주식회사', repName: '박대행', bizNo: '220-81-12345' },
};

async function readAll(key: string): Promise<Buffer> {
  const { stream } = await storage.read(key);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function seedTemplateWithPdf(pgWsId: string, uploadedBy: string): Promise<string> {
  const templateRepo = await getContractTemplateRepo();
  const attRepo = await getAttachmentRepo();
  const templateId = randomUUID();
  await templateRepo.create({
    id: templateId,
    pgWsId,
    name: '표준 계약서',
    description: '',
    createdBy: uploadedBy,
  });
  const attId = randomUUID();
  await storage.save(attId, await makeKoreanTemplate(1), 'application/pdf');
  await attRepo.save({
    id: attId,
    name: 'template.pdf',
    size: 1,
    mimeType: 'application/pdf',
    url: `/api/files/${attId}`,
    uploadedBy,
    status: 'ready',
  });
  await attRepo.claim(
    { ids: [attId], owner: { contractTemplateId: templateId }, uploadedBy },
  );
  return templateId;
}

type SendEnv = {
  buyerUser: { id: string; email: string };
  buyerWs: { id: string };
  pgUser: { id: string; email: string };
  pgWs: { id: string };
  rfpId: string;
  rfpCode: string;
  bidId: string;
  templateId: string;
  actorPg: Actor;
  buyerActor: Actor;
};

async function seedSendEnv(): Promise<SendEnv> {
  const buyerUser = await seedUser(db, { email: 'buyer@x.com', name: '김구매' });
  const biz = await seedBizProfile(db, { bizNo: '1112223334' });
  // seed a specific tier for buyerTier snapshot verification.
  await db
    .update((await import('@/lib/db/schema')).bizProfiles)
    .set({ grade: 'sme1' })
    .where(eq((await import('@/lib/db/schema')).bizProfiles.id, biz.id));
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@x.com', name: '박대행' });
  const pgWs = await seedPgWorkspace(db, 'PG사');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfpId = randomUUID();
  const rfpCode = 'P-2607-0042';
  await db.insert(rfps).values({
    id: rfpId,
    code: rfpCode,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: '온라인몰 결제대행 견적',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'awarded',
    createdBy: buyerUser.id,
    sentAt: new Date(),
  });

  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
  });
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+2',
    settleLimit: '500000000',
    guaranteeInsurance: '30000000',
    paymentFees: { card: { sole: 0.005, general: 0.022 } },
    customFees: {},
    submittedBy: pgUser.id,
    status: 'submitted',
  });
  await db.update(rfps).set({ awardedBidId: bidId }).where(eq(rfps.id, rfpId));

  const templateId = await seedTemplateWithPdf(pgWs.id, pgUser.id);

  return {
    buyerUser,
    buyerWs,
    pgUser,
    pgWs,
    rfpId,
    rfpCode,
    bidId,
    templateId,
    actorPg: { userId: pgUser.id, workspaceId: pgWs.id },
    buyerActor: { userId: buyerUser.id, workspaceId: buyerWs.id },
  };
}

function sendInput(env: SendEnv, overrides?: Partial<SendContractInput>): SendContractInput {
  return {
    rfpCode: env.rfpCode,
    templateId: env.templateId,
    title: '전자계약서',
    parties: PARTIES,
    pgSignerUserId: env.pgUser.id,
    expiresInDays: 14,
    ...overrides,
  };
}

async function docIdForRfp(rfpId: string): Promise<string> {
  const [row] = await db.select().from(contractDocs).where(eq(contractDocs.rfpId, rfpId));
  return row.id;
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
  svc = await buildService();
});

afterEach(() => {
  __resetForTest();
  __resetStorageForTest();
});

describe('ContractService.send', () => {
  it('creates the doc, two signers, sent event, notification, outbox, audit, and a stored base PDF', async () => {
    const env = await seedSendEnv();
    const r = await svc.send(sendInput(env), env.actorPg, META);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toMatch(/^CT-\d{4}-0001$/);

    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.rfpId, env.rfpId));
    expect(doc.status).toBe('sent');
    expect(doc.code).toBe(r.code);
    expect(doc.buyerWsId).toBe(env.buyerWs.id);
    expect(doc.pgWsId).toBe(env.pgWs.id);
    expect(doc.templateId).toBe(env.templateId);
    expect(doc.createdBy).toBe(env.pgUser.id);
    expect(doc.basePdfSha256).toHaveLength(64);
    expect(doc.basePdfSize).toBeGreaterThan(0);
    expect(doc.id).toBe(r.docId);

    // terms snapshot mirrors the awarded bid + buyer tier.
    const bidRepo = await getBidRepo();
    const bid = await bidRepo.findById(env.bidId);
    expect(doc.termsSnapshot.settleCycle).toBe(bid!.settleCycle);
    expect(doc.termsSnapshot.paymentFees).toEqual(bid!.paymentFees);
    expect(doc.termsSnapshot.rfpCode).toBe(env.rfpCode);
    expect(doc.termsSnapshot.buyerTier).toBe('sme1');
    expect(doc.parties).toEqual(PARTIES);

    // two signer rows, buyer + pg, snapshotted from profiles.
    const signers = await db
      .select()
      .from(contractDocSigners)
      .where(eq(contractDocSigners.docId, doc.id));
    expect(signers).toHaveLength(2);
    const buyerSigner = signers.find((s) => s.party === 'buyer')!;
    const pgSigner = signers.find((s) => s.party === 'pg')!;
    expect(buyerSigner.userId).toBe(env.buyerUser.id);
    expect(buyerSigner.email).toBe('buyer@x.com');
    expect(pgSigner.userId).toBe(env.pgUser.id);
    expect(pgSigner.signedAt).toBeNull();

    // sent event authored by the PG actor.
    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, doc.id));
    const sent = events.find((e) => e.type === 'sent')!;
    expect(sent.actorParty).toBe('pg');
    expect(sent.actorUserId).toBe(env.pgUser.id);
    expect(sent.ip).toBe(META.ip);
    // not a fallback (createdBy is an approved buyer member).
    expect((sent.metadata as Record<string, unknown> | null)?.buyerSignerFallback).toBeFalsy();

    // in-app notification to the buyer signer.
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, env.buyerUser.id));
    expect(notifs.some((n) => n.type === 'contract.sent' && n.channel === 'in_app')).toBe(true);

    // email outbox entry to the buyer signer.
    const outbox = await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'contract.sent'));
    expect(outbox).toHaveLength(1);
    expect(outbox[0].toAddr).toBe('buyer@x.com');

    // audit + stored base PDF.
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, 'contract.send'));
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(r.code);
    await expect(storage.head(doc.basePdfKey)).resolves.toMatchObject({ size: doc.basePdfSize });
  });

  it('rejects when the RFP is not awarded → NOT_AWARDED', async () => {
    const env = await seedSendEnv();
    await db.update(rfps).set({ awardedBidId: null, status: 'sent' }).where(eq(rfps.id, env.rfpId));
    const r = await svc.send(sendInput(env), env.actorPg, META);
    expect(r).toEqual({ ok: false, error: 'NOT_AWARDED' });
  });

  it('rejects a PG that did not win the award → FORBIDDEN_PG', async () => {
    const env = await seedSendEnv();
    const otherPgWs = await seedPgWorkspace(db, '다른PG');
    const otherPgUser = await seedUser(db, { email: 'other-pg@y.com' });
    await seedMembership(db, otherPgWs.id, otherPgUser.id, 'admin');
    const r = await svc.send(sendInput(env), { userId: otherPgUser.id, workspaceId: otherPgWs.id }, META);
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
  });

  it("rejects another workspace's template → TEMPLATE_NOT_FOUND", async () => {
    const env = await seedSendEnv();
    const otherPgWs = await seedPgWorkspace(db, '다른PG');
    const otherUser = await seedUser(db, { email: 'o@y.com' });
    const foreignTemplate = await seedTemplateWithPdf(otherPgWs.id, otherUser.id);
    const r = await svc.send(sendInput(env, { templateId: foreignTemplate }), env.actorPg, META);
    expect(r).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });

  it('rejects a template whose PDF fails validation → TEMPLATE_PDF_INVALID', async () => {
    const env = await seedSendEnv();
    // Corrupt the template attachment bytes in storage.
    const template = await (await getContractTemplateRepo()).findById(env.templateId);
    await storage.save(template!.attachment!.id, Buffer.from('not a pdf'), 'application/pdf');
    const r = await svc.send(sendInput(env), env.actorPg, META);
    expect(r).toEqual({ ok: false, error: 'TEMPLATE_PDF_INVALID' });
    const docs = await db.select().from(contractDocs);
    expect(docs).toHaveLength(0);
  });

  it('rejects a second active send for the same RFP → ACTIVE_DOC_EXISTS', async () => {
    const env = await seedSendEnv();
    const first = await svc.send(sendInput(env), env.actorPg, META);
    expect(first.ok).toBe(true);
    const second = await svc.send(sendInput(env), env.actorPg, META);
    expect(second).toEqual({ ok: false, error: 'ACTIVE_DOC_EXISTS' });
    const docs = await db.select().from(contractDocs);
    expect(docs).toHaveLength(1);
  });

  it('rejects a PG signer who is not an approved member → INVALID_SIGNER', async () => {
    const env = await seedSendEnv();
    const stranger = await seedUser(db, { email: 'stranger@z.com' });
    const r = await svc.send(sendInput(env, { pgSignerUserId: stranger.id }), env.actorPg, META);
    expect(r).toEqual({ ok: false, error: 'INVALID_SIGNER' });
  });

  it('falls back to the earliest-joined approved buyer admin when the creator left, and marks the sent event', async () => {
    // Buyer creator is not a member; two approved admins with distinct joinedAt.
    const creator = await seedUser(db, { email: 'creator@x.com' });
    const biz = await seedBizProfile(db, { bizNo: '9998887776' });
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const adminEarly = await seedUser(db, { email: 'early@x.com', name: '고참' });
    const adminLate = await seedUser(db, { email: 'late@x.com', name: '신참' });
    await seedMembership(db, buyerWs.id, adminEarly.id, 'admin', { joinedAt: new Date('2026-01-01T00:00:00Z') });
    await seedMembership(db, buyerWs.id, adminLate.id, 'admin', { joinedAt: new Date('2026-06-01T00:00:00Z') });

    const pgUser = await seedUser(db, { email: 'pg2@x.com' });
    const pgWs = await seedPgWorkspace(db, 'PG2');
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = randomUUID();
    const rfpCode = 'P-2607-0099';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'fallback',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'awarded',
      createdBy: creator.id,
      sentAt: new Date(),
    });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
      sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 7), status: 'accepted',
    });
    const bidId = randomUUID();
    await db.insert(bids).values({
      id: bidId, rfpId, pgWsId: pgWs.id, invitationId: invId,
      settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0',
      paymentFees: {}, customFees: {}, submittedBy: pgUser.id, status: 'submitted',
    });
    await db.update(rfps).set({ awardedBidId: bidId }).where(eq(rfps.id, rfpId));
    const templateId = await seedTemplateWithPdf(pgWs.id, pgUser.id);

    const r = await svc.send(
      { rfpCode, templateId, title: 't', parties: PARTIES, pgSignerUserId: pgUser.id, expiresInDays: 7 },
      { userId: pgUser.id, workspaceId: pgWs.id },
      META,
    );
    expect(r.ok).toBe(true);
    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.rfpId, rfpId));
    const signers = await db.select().from(contractDocSigners).where(eq(contractDocSigners.docId, doc.id));
    const buyerSigner = signers.find((s) => s.party === 'buyer')!;
    expect(buyerSigner.userId).toBe(adminEarly.id);
    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, doc.id));
    const sent = events.find((e) => e.type === 'sent')!;
    expect((sent.metadata as Record<string, unknown>).buyerSignerFallback).toBe(true);
  });

  it('rejects when there is no eligible buyer signer → NO_BUYER_SIGNER', async () => {
    const creator = await seedUser(db, { email: 'creator2@x.com' });
    const biz = await seedBizProfile(db, { bizNo: '5556667778' });
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    // Only a non-admin member; creator is not a member at all.
    const member = await seedUser(db, { email: 'member@x.com' });
    await seedMembership(db, buyerWs.id, member.id, 'member');

    const pgUser = await seedUser(db, { email: 'pg3@x.com' });
    const pgWs = await seedPgWorkspace(db, 'PG3');
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId, code: 'P-2607-0100', buyerWsId: buyerWs.id, bizProfileId: biz.id,
      title: 'no-signer', deadline: new Date(Date.now() + 86_400_000),
      status: 'awarded', createdBy: creator.id, sentAt: new Date(),
    });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
      sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 7), status: 'accepted',
    });
    const bidId = randomUUID();
    await db.insert(bids).values({
      id: bidId, rfpId, pgWsId: pgWs.id, invitationId: invId,
      settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0',
      paymentFees: {}, customFees: {}, submittedBy: pgUser.id, status: 'submitted',
    });
    await db.update(rfps).set({ awardedBidId: bidId }).where(eq(rfps.id, rfpId));
    const templateId = await seedTemplateWithPdf(pgWs.id, pgUser.id);

    const r = await svc.send(
      { rfpCode: 'P-2607-0100', templateId, title: 't', parties: PARTIES, pgSignerUserId: pgUser.id, expiresInDays: 7 },
      { userId: pgUser.id, workspaceId: pgWs.id },
      META,
    );
    expect(r).toEqual({ ok: false, error: 'NO_BUYER_SIGNER' });
    const docs = await db.select().from(contractDocs);
    expect(docs).toHaveLength(0);
  });
});

describe('ContractService.sign', () => {
  it('records a single signature (buyer first) and notifies the PG side; not completed', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);

    const r = await svc.sign(docId, { imagePng: PNG_1X1, method: 'draw' }, env.buyerActor, META);
    expect(r).toEqual({ ok: true, completed: false });

    const signers = await db.select().from(contractDocSigners).where(eq(contractDocSigners.docId, docId));
    const buyerSigner = signers.find((s) => s.party === 'buyer')!;
    expect(buyerSigner.signedAt).not.toBeNull();
    expect(buyerSigner.consentTextVersion).toBe(CONTRACT_CONSENT_TEXT_VERSION);
    expect(buyerSigner.signatureMethod).toBe('draw');

    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc.status).toBe('sent');

    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId));
    expect(events.some((e) => e.type === 'signed' && e.actorParty === 'buyer')).toBe(true);

    const signedNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'contract.signed'));
    // PG signer + PG sender dedupe to a single recipient.
    expect(signedNotifs).toHaveLength(1);
    expect(signedNotifs[0].userId).toBe(env.pgUser.id);
  });

  it('completes when both parties sign; skips the signed notification and finalizes', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);

    await svc.sign(docId, { imagePng: PNG_1X1, method: 'draw' }, env.buyerActor, META);
    const r = await svc.sign(docId, { imagePng: PNG_1X1, method: 'type' }, env.actorPg, META);
    expect(r).toEqual({ ok: true, completed: true });

    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc.status).toBe('completed');
    expect(doc.finalPdfKey).not.toBeNull();
    expect(doc.finalPdfSha256).toHaveLength(64);
    expect(doc.completedAt).not.toBeNull();

    // completed event once.
    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId));
    expect(events.filter((e) => e.type === 'completed')).toHaveLength(1);

    // the completing sign did NOT create a second signed notification.
    const signed = await db.select().from(notifications).where(eq(notifications.type, 'contract.signed'));
    expect(signed).toHaveLength(1); // only the buyer-first signed notification

    // completed notifications to both sides (buyer signer + pg signer/sender deduped).
    const completed = await db.select().from(notifications).where(eq(notifications.type, 'contract.completed'));
    expect(completed).toHaveLength(2);
    const completedUserIds = completed.map((n) => n.userId).sort();
    expect(completedUserIds).toEqual([env.buyerUser.id, env.pgUser.id].sort());

    // stored final PDF hash matches the recorded sha.
    const bytes = await readAll(doc.finalPdfKey!);
    expect(sha256Hex(bytes)).toBe(doc.finalPdfSha256);
  });

  it('rejects a duplicate signature → ALREADY_SIGNED', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    await svc.sign(docId, { imagePng: PNG_1X1, method: 'draw' }, env.buyerActor, META);
    const r = await svc.sign(docId, { imagePng: PNG_1X1, method: 'draw' }, env.buyerActor, META);
    expect(r).toEqual({ ok: false, error: 'ALREADY_SIGNED' });
  });

  it('rejects a signer from an unrelated workspace → FORBIDDEN_SIGNER', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const outsiderWs = await seedPgWorkspace(db, 'outsider');
    const outsider = await seedUser(db, { email: 'out@z.com' });
    await seedMembership(db, outsiderWs.id, outsider.id, 'admin');
    const r = await svc.sign(
      docId, { imagePng: PNG_1X1, method: 'draw' }, { userId: outsider.id, workspaceId: outsiderWs.id }, META,
    );
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_SIGNER' });
  });

  it('rejects a member of the right workspace who is not the designated signer → FORBIDDEN_SIGNER', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const otherBuyer = await seedUser(db, { email: 'buyer2@x.com' });
    await seedMembership(db, env.buyerWs.id, otherBuyer.id, 'admin');
    const r = await svc.sign(
      docId, { imagePng: PNG_1X1, method: 'draw' }, { userId: otherBuyer.id, workspaceId: env.buyerWs.id }, META,
    );
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_SIGNER' });
  });

  it('detects an expired doc at sign time → EXPIRED, transitions + notifies', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    await db.update(contractDocs).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(contractDocs.id, docId));

    const r = await svc.sign(docId, { imagePng: PNG_1X1, method: 'draw' }, env.buyerActor, META);
    expect(r).toEqual({ ok: false, error: 'EXPIRED' });
    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc.status).toBe('expired');
    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId));
    expect(events.some((e) => e.type === 'expired')).toBe(true);
  });
});

describe('ContractService.ensureFinalized (idempotent, lazy repair)', () => {
  async function markBothSigned(docId: string): Promise<void> {
    const docRepo = await getContractDocRepo();
    const signers = await docRepo.getSigners(docId);
    const buyer = signers.find((s) => s.party === 'buyer')!;
    const pg = signers.find((s) => s.party === 'pg')!;
    await docRepo.markSigned(
      buyer.id,
      {
        consentAt: new Date('2026-07-10T01:00:00Z').toISOString(),
        consentTextVersion: CONTRACT_CONSENT_TEXT_VERSION,
        signedAt: new Date('2026-07-10T01:00:00Z').toISOString(),
        signatureImage: PNG_1X1,
        signatureMethod: 'draw',
        signIp: META.ip,
        signUserAgent: META.userAgent,
      },
      db,
    );
    await docRepo.markSigned(
      pg.id,
      {
        consentAt: new Date('2026-07-10T02:00:00Z').toISOString(),
        consentTextVersion: CONTRACT_CONSENT_TEXT_VERSION,
        signedAt: new Date('2026-07-10T02:00:00Z').toISOString(),
        signatureImage: PNG_1X1,
        signatureMethod: 'type',
        signIp: META.ip,
        signUserAgent: META.userAgent,
      },
      db,
    );
  }

  it('finalizes a manually-both-signed sent doc, and a second call is a no-op', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    await markBothSigned(docId);

    const r1 = await svc.ensureFinalized(docId);
    expect(r1).toEqual({ ok: true, completed: true });

    const [doc1] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc1.status).toBe('completed');
    const completedEvents1 = (await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId)))
      .filter((e) => e.type === 'completed');
    expect(completedEvents1).toHaveLength(1);
    const completedNotifs1 = await db.select().from(notifications).where(eq(notifications.type, 'contract.completed'));
    expect(completedNotifs1).toHaveLength(2);

    // stored final hash matches.
    const bytes = await readAll(doc1.finalPdfKey!);
    expect(sha256Hex(bytes)).toBe(doc1.finalPdfSha256);

    // idempotent second call: no new completion event / notification.
    const r2 = await svc.ensureFinalized(docId);
    expect(r2).toEqual({ ok: true, completed: true });
    const completedEvents2 = (await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId)))
      .filter((e) => e.type === 'completed');
    expect(completedEvents2).toHaveLength(1);
    const completedNotifs2 = await db.select().from(notifications).where(eq(notifications.type, 'contract.completed'));
    expect(completedNotifs2).toHaveLength(2);
  });

  it('is a no-op when both parties have not signed', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const r = await svc.ensureFinalized(docId);
    expect(r).toEqual({ ok: true, completed: false });
    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc.status).toBe('sent');
  });
});

describe('ContractService.expireIfDue', () => {
  it('expires an overdue sent doc once, notifies, and is a no-op on re-call', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    await db.update(contractDocs).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(contractDocs.id, docId));

    const r1 = await svc.expireIfDue(docId);
    expect(r1).toEqual({ ok: true, expired: true });
    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc.status).toBe('expired');
    const expiredEvents = (await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId)))
      .filter((e) => e.type === 'expired');
    expect(expiredEvents).toHaveLength(1);
    const expiredNotifs = await db.select().from(notifications).where(eq(notifications.type, 'contract.expired'));
    expect(expiredNotifs.length).toBeGreaterThanOrEqual(2);

    const r2 = await svc.expireIfDue(docId);
    expect(r2).toEqual({ ok: true, expired: false });
    const expiredEvents2 = (await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId)))
      .filter((e) => e.type === 'expired');
    expect(expiredEvents2).toHaveLength(1);
  });

  it('does not expire a doc that is not yet due', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const r = await svc.expireIfDue(docId);
    expect(r).toEqual({ ok: true, expired: false });
  });
});

describe('ContractService.decline', () => {
  it('lets a buyer admin decline; records reason, event, PG notification, audit', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);

    const r = await svc.decline(docId, '조건 불일치', env.buyerActor, META);
    expect(r).toEqual({ ok: true });
    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc.status).toBe('declined');
    expect(doc.declineReason).toBe('조건 불일치');
    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId));
    expect(events.some((e) => e.type === 'declined' && e.actorParty === 'buyer')).toBe(true);
    const declinedNotifs = await db.select().from(notifications).where(eq(notifications.type, 'contract.declined'));
    expect(declinedNotifs).toHaveLength(1);
    expect(declinedNotifs[0].userId).toBe(env.pgUser.id);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, 'contract.decline'));
    expect(audits).toHaveLength(1);
  });

  it('rejects a PG actor trying to decline → FORBIDDEN', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const r = await svc.decline(docId, 'nope', env.actorPg, META);
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('ContractService.cancel', () => {
  it('lets the PG sender cancel; records event, buyer notification, audit', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);

    const r = await svc.cancel(docId, env.actorPg, META);
    expect(r).toEqual({ ok: true });
    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));
    expect(doc.status).toBe('canceled');
    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId));
    expect(events.some((e) => e.type === 'canceled' && e.actorParty === 'pg')).toBe(true);
    const canceledNotifs = await db.select().from(notifications).where(eq(notifications.type, 'contract.canceled'));
    expect(canceledNotifs).toHaveLength(1);
    expect(canceledNotifs[0].userId).toBe(env.buyerUser.id);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, 'contract.cancel'));
    expect(audits).toHaveLength(1);
  });

  it('rejects a buyer actor trying to cancel → FORBIDDEN', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const r = await svc.cancel(docId, env.buyerActor, META);
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('ContractService.reassignBuyerSigner', () => {
  it('lets a buyer admin reassign the unsigned buyer signer; notifies the new signer', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const newSigner = await seedUser(db, { email: 'newsigner@x.com', name: '새담당' });
    await seedMembership(db, env.buyerWs.id, newSigner.id, 'member');

    const r = await svc.reassignBuyerSigner(docId, newSigner.id, env.buyerActor, META);
    expect(r).toEqual({ ok: true });
    const signers = await db.select().from(contractDocSigners).where(eq(contractDocSigners.docId, docId));
    const buyerSigner = signers.find((s) => s.party === 'buyer')!;
    expect(buyerSigner.userId).toBe(newSigner.id);
    expect(buyerSigner.email).toBe('newsigner@x.com');
    const events = await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId));
    expect(events.some((e) => e.type === 'signer_reassigned')).toBe(true);
    const notifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, 'contract.signer_reassigned'), eq(notifications.userId, newSigner.id)));
    expect(notifs).toHaveLength(1);
  });

  it('rejects reassignment by a non-admin → FORBIDDEN', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const member = await seedUser(db, { email: 'plainmember@x.com' });
    await seedMembership(db, env.buyerWs.id, member.id, 'member');
    const newSigner = await seedUser(db, { email: 'ns2@x.com' });
    await seedMembership(db, env.buyerWs.id, newSigner.id, 'member');
    const r = await svc.reassignBuyerSigner(
      docId, newSigner.id, { userId: member.id, workspaceId: env.buyerWs.id }, META,
    );
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('rejects reassignment once the buyer has signed → SIGNER_ALREADY_SIGNED', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    await svc.sign(docId, { imagePng: PNG_1X1, method: 'draw' }, env.buyerActor, META);
    const newSigner = await seedUser(db, { email: 'ns3@x.com' });
    await seedMembership(db, env.buyerWs.id, newSigner.id, 'admin');
    const r = await svc.reassignBuyerSigner(docId, newSigner.id, env.buyerActor, META);
    expect(r).toEqual({ ok: false, error: 'SIGNER_ALREADY_SIGNED' });
  });

  it('rejects a new signer who is not an approved buyer member → INVALID_SIGNER', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const stranger = await seedUser(db, { email: 'stranger2@z.com' });
    const r = await svc.reassignBuyerSigner(docId, stranger.id, env.buyerActor, META);
    expect(r).toEqual({ ok: false, error: 'INVALID_SIGNER' });
  });
});

describe('ContractService.verify', () => {
  it('reports intact for a stored base PDF and detects tampering', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const [doc] = await db.select().from(contractDocs).where(eq(contractDocs.id, docId));

    const ok = await svc.verify(docId, env.buyerActor);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.intact).toBe(true);
      expect(ok.computed).toBe(doc.basePdfSha256);
    }

    await storage.save(doc.basePdfKey, Buffer.from('tampered bytes'), 'application/pdf');
    const bad = await svc.verify(docId, env.actorPg);
    expect(bad.ok).toBe(true);
    if (bad.ok) expect(bad.intact).toBe(false);
  });

  it('rejects a non-member → FORBIDDEN', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);
    const outsiderWs = await seedPgWorkspace(db, 'outsider2');
    const outsider = await seedUser(db, { email: 'out2@z.com' });
    const r = await svc.verify(docId, { userId: outsider.id, workspaceId: outsiderWs.id });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('ContractService.recordView', () => {
  it('records a viewed event only for the designated signer, idempotently', async () => {
    const env = await seedSendEnv();
    await svc.send(sendInput(env), env.actorPg, META);
    const docId = await docIdForRfp(env.rfpId);

    // buyer signer views twice — one 'viewed' event.
    await svc.recordView(docId, env.buyerActor, META);
    await svc.recordView(docId, env.buyerActor, META);
    let viewed = (await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId)))
      .filter((e) => e.type === 'viewed');
    expect(viewed).toHaveLength(1);
    expect(viewed[0].actorParty).toBe('buyer');

    // pg signer views — adds one more.
    await svc.recordView(docId, env.actorPg, META);
    viewed = (await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId)))
      .filter((e) => e.type === 'viewed');
    expect(viewed).toHaveLength(2);

    // a non-signer buyer member records nothing.
    const otherBuyer = await seedUser(db, { email: 'nb@x.com' });
    await seedMembership(db, env.buyerWs.id, otherBuyer.id, 'admin');
    const r = await svc.recordView(docId, { userId: otherBuyer.id, workspaceId: env.buyerWs.id }, META);
    expect(r.ok).toBe(true);
    viewed = (await db.select().from(contractDocEvents).where(eq(contractDocEvents.docId, docId)))
      .filter((e) => e.type === 'viewed');
    expect(viewed).toHaveLength(2);
  });
});

describe('ContractService factory singleton', () => {
  afterEach(() => {
    __resetContractServiceForTest();
  });

  it('getContractService returns the injected instance', async () => {
    const injected = await buildService();
    __setContractServiceForTest(injected);
    expect(await getContractService()).toBe(injected);
  });

  it('__reset clears the cached instance', async () => {
    const injected = await buildService();
    __setContractServiceForTest(injected);
    __resetContractServiceForTest();
    expect(await getContractService()).not.toBe(injected);
  });
});
