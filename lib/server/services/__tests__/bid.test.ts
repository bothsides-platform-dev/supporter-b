import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAttachmentRepo,
  getBidNoteRepo,
  getBidRepo,
  getPgSigningTemplateRepo,
  getInvitationRepo,
  getRfpRepo,
  getRfpRequoteRequestRepo,
  getAuditLogRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { attachments, auditLogs, bids, rfpInvitations } from '@/lib/db/schema';
import {
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import { BidService } from '../bid';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: BidService;

async function buildService(): Promise<BidService> {
  const [bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo, signingTemplateRepo] =
    await Promise.all([
      getBidRepo(), getInvitationRepo(), getRfpRepo(),
      getWorkspaceRepo(), getAttachmentRepo(), getBidNoteRepo(),
      getRfpRequoteRequestRepo(), getAuditLogRepo(), getPgSigningTemplateRepo(),
    ]);
  return new BidService(db, bidRepo, invRepo, rfpRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo, signingTemplateRepo);
}

beforeEach(async () => {
  __resetForTest();
  // removeNote deletes attachment bytes through getStorage(), which is
  // R2-or-throw — inject the test double so no real bucket is needed.
  __setStorageForTest(new InMemoryStorage());
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});

afterEach(() => {
  __resetForTest();
  __resetStorageForTest();
});

// ─── seed helpers ────────────────────────────────────────────────────────────

type WithdrawSetup = {
  pgUserId: string;
  pgWsId: string;
  rfpId: string;
  invitationId: string;
  bidId: string;
};

async function seedWithdrawEnv(): Promise<WithdrawSetup> {
  const buyer = await seedUser(db, { email: 'buyer@withdraw.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@withdraw.com' });
  const pgWs = await seedPgWorkspace(db, 'pg.withdraw');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, {
    buyerWsId: buyerWs.id,
    createdBy: buyer.id,
    code: 'P-2606-0010',
  });
  // Set status to 'sent' so invitation is active
  await db
    .update((await import('@/lib/db/schema')).rfps)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq((await import('@/lib/db/schema')).rfps.id, rfp.id));

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
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    status: 'submitted',
    submittedBy: pgUser.id,
    submittedAt: new Date(),
  });

  return {
    pgUserId: pgUser.id,
    pgWsId: pgWs.id,
    rfpId: rfp.id,
    invitationId: invId,
    bidId,
  };
}

// ─── BidService.withdraw ─────────────────────────────────────────────────────

describe('BidService.withdraw', () => {
  it('returns BID_NOT_FOUND when bid does not exist', async () => {
    const r = await service.withdraw(randomUUID(), {
      userId: randomUUID(),
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('BID_NOT_FOUND');
  });

  it('returns FORBIDDEN when actor workspace does not own the bid', async () => {
    const s = await seedWithdrawEnv();
    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });

  it('sets bid status to withdrawn', async () => {
    const s = await seedWithdrawEnv();
    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(true);

    const [row] = await db
      .select({ status: bids.status })
      .from(bids)
      .where(eq(bids.id, s.bidId));
    expect(row!.status).toBe('withdrawn');
  });

  it('is idempotent — already withdrawn bid returns ok', async () => {
    const s = await seedWithdrawEnv();
    await db.update(bids).set({ status: 'withdrawn' }).where(eq(bids.id, s.bidId));

    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(true);
  });

  it('returns ALREADY_AWARDED when rfp status is awarded', async () => {
    const s = await seedWithdrawEnv();
    // Mark the RFP as awarded.
    await db
      .update((await import('@/lib/db/schema')).rfps)
      .set({ status: 'awarded', awardedBidId: s.bidId })
      .where(eq((await import('@/lib/db/schema')).rfps.id, s.rfpId));

    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ALREADY_AWARDED');
  });

  it('returns FORBIDDEN when invitation is expired (canAccess false)', async () => {
    const s = await seedWithdrawEnv();
    // Expire the invitation so canAccess returns false.
    await db
      .update(rfpInvitations)
      .set({ status: 'expired' })
      .where(eq(rfpInvitations.id, s.invitationId));

    // pgWsId matches bid.pgWsId (passes first guard), but canAccess fails.
    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });
});

// ─── addNote / removeNote seed ────────────────────────────────────────────────

async function seedNoteEnv() {
  const buyerUser = await seedUser(db, { email: 'buyer@note.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'pg@note.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-note');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    tokenHash: 'tok-note',
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    status: 'accepted',
    acceptedByUserId: pgUser.id,
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
    submittedBy: pgUser.id,
  });
  return { buyerUser, buyerWs, pgWs, rfpId, bidId };
}

async function seedUnlinkedAttachment(uploadedBy: string) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name: 'file.pdf',
    size: 100,
    mimeType: 'application/pdf',
    uploadedBy,
  });
  return id;
}

// ─── BidService.addNote ───────────────────────────────────────────────────────

describe('BidService.addNote', () => {
  it('returns NOTE_EMPTY when body empty and no attachments', async () => {
    const s = await seedNoteEnv();
    const r = await service.addNote(
      { bidId: s.bidId, body: '  ', attachmentIds: [] },
      { userId: s.buyerUser.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NOTE_EMPTY');
  });

  it('returns BID_NOT_FOUND when bid does not exist', async () => {
    const s = await seedNoteEnv();
    const r = await service.addNote(
      { bidId: randomUUID(), body: 'hi', attachmentIds: [] },
      { userId: s.buyerUser.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('BID_NOT_FOUND');
  });

  it('returns FORBIDDEN when actor workspace is not rfp buyer', async () => {
    const s = await seedNoteEnv();
    const r = await service.addNote(
      { bidId: s.bidId, body: 'hi', attachmentIds: [] },
      { userId: s.pgWs.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });

  it('saves note and returns noteId', async () => {
    const s = await seedNoteEnv();
    const r = await service.addNote(
      { bidId: s.bidId, body: 'great bid', attachmentIds: [] },
      { userId: s.buyerUser.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.noteId).toBeTruthy();
  });

  it('returns INVALID_ATTACHMENT when attachment already linked', async () => {
    const s = await seedNoteEnv();
    const attId = await seedUnlinkedAttachment(s.buyerUser.id);
    // Link it to the rfp first to simulate "already linked"
    await db.update(attachments).set({ rfpId: s.rfpId }).where(eq(attachments.id, attId));
    const r = await service.addNote(
      { bidId: s.bidId, body: 'with att', attachmentIds: [attId] },
      { userId: s.buyerUser.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_ATTACHMENT');
  });

  it('links attachments to note on success', async () => {
    const s = await seedNoteEnv();
    const attId = await seedUnlinkedAttachment(s.buyerUser.id);
    const r = await service.addNote(
      { bidId: s.bidId, body: 'with att', attachmentIds: [attId] },
      { userId: s.buyerUser.id, workspaceId: s.buyerWs.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rows = await db.select().from(attachments).where(eq(attachments.id, attId));
    expect(rows[0].bidNoteId).toBe(r.noteId);
  });
});

// ─── BidService.removeNote ────────────────────────────────────────────────────

describe('BidService.removeNote', () => {
  it('returns NOTE_NOT_FOUND when note does not exist', async () => {
    const s = await seedNoteEnv();
    const r = await service.removeNote(randomUUID(), {
      userId: s.buyerUser.id, workspaceId: s.buyerWs.id,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('NOTE_NOT_FOUND');
  });

  it('returns FORBIDDEN when actor workspace is not rfp buyer', async () => {
    const s = await seedNoteEnv();
    // Save a note first
    const addR = await service.addNote(
      { bidId: s.bidId, body: 'del me', attachmentIds: [] },
      { userId: s.buyerUser.id, workspaceId: s.buyerWs.id },
    );
    if (!addR.ok) throw new Error('setup failed');
    const r = await service.removeNote(addR.noteId, {
      userId: s.pgWs.id, workspaceId: s.pgWs.id,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });

  it('deletes note row', async () => {
    const s = await seedNoteEnv();
    const addR = await service.addNote(
      { bidId: s.bidId, body: 'del me', attachmentIds: [] },
      { userId: s.buyerUser.id, workspaceId: s.buyerWs.id },
    );
    if (!addR.ok) throw new Error('setup failed');
    const r = await service.removeNote(addR.noteId, {
      userId: s.buyerUser.id, workspaceId: s.buyerWs.id,
    });
    expect(r.ok).toBe(true);
    // Note should be gone
    const stub = await (await getBidNoteRepo()).findById(addR.noteId);
    expect(stub).toBeUndefined();
  });
});

// ─── 감사 로그 (C5) ───────────────────────────────────────────────────────────

describe('BidService.withdraw — 감사 로그 기록', () => {
  it('withdraw 성공 시 bid.withdraw 감사 행을 남긴다', async () => {
    const s = await seedWithdrawEnv();
    const r = await service.withdraw(s.bidId, {
      userId: s.pgUserId,
      workspaceId: s.pgWsId,
    });
    expect(r.ok).toBe(true);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'bid.withdraw'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: s.pgUserId,
      actorWorkspaceId: s.pgWsId,
      entityType: 'rfp',
      entityId: 'P-2606-0010',
    });
    expect(rows[0]!.metadata).toMatchObject({ bidId: s.bidId });
  });

  it('이미 철회된 견적의 재철회(idempotent no-op)는 감사 행을 남기지 않는다', async () => {
    const s = await seedWithdrawEnv();
    await service.withdraw(s.bidId, { userId: s.pgUserId, workspaceId: s.pgWsId });
    await service.withdraw(s.bidId, { userId: s.pgUserId, workspaceId: s.pgWsId });

    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'bid.withdraw'));
    expect(rows).toHaveLength(1);
  });
});

// ─── BidService.submit — 첨부(견적서) 업로더 검증 ─────────────────────────────────

type SubmitSetup = {
  pgUser: { id: string };
  pgWs: { id: string };
  /** 마스터/운영 계정: workspace_members 행이 없는 채로 PG 워크스페이스에 진입. */
  masterUser: { id: string };
  rfp: { id: string; code: string };
};

async function seedSubmitEnv(): Promise<SubmitSetup> {
  const buyer = await seedUser(db, { email: 'buyer@submit.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgUser = await seedUser(db, { email: 'pg@submit.com' });
  const pgWs = await seedPgWorkspace(db, 'pg.submit');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  // 마스터/운영 계정 — users 행만 있고 어떤 워크스페이스의 멤버도 아니다
  // (switchWorkspaceAction 의 마스터 우회로 PG 워크스페이스에 진입한 상태를 재현).
  const masterUser = await seedUser(db, { email: 'master@ops.com' });

  const rfp = await seedRfp(db, {
    buyerWsId: buyerWs.id,
    createdBy: buyer.id,
    code: 'P-2606-0020',
  });
  const schema = await import('@/lib/db/schema');
  await db
    .update(schema.rfps)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq(schema.rfps.id, rfp.id));

  await db.insert(rfpInvitations).values({
    id: randomUUID(),
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
  });

  return { pgUser, pgWs, masterUser, rfp };
}

function submitInput(rfpId: string, proposalAttachmentId: string) {
  return {
    rfpId,
    settleCycle: 'D+1',
    settleLimit: 0,
    guaranteeInsurance: 0,
    signupFee: 0,
    paymentFees: {},
    customFees: {},
    proposalAttachmentId,
  };
}

describe('BidService.submit — 견적서 첨부 검증', () => {
  it('마스터(비멤버)가 자기가 올린 견적서로 제출하면 성공한다', async () => {
    const s = await seedSubmitEnv();
    // 마스터가 직접 업로드한 미링크 첨부 (uploadedBy === 제출자).
    const attId = await seedUnlinkedAttachment(s.masterUser.id);
    const r = await service.submit(submitInput(s.rfp.id, attId), {
      userId: s.masterUser.id,
      workspaceId: s.pgWs.id,
    });
    expect(r.ok).toBe(true);
  });

  it('일반 PG 멤버가 자기 견적서로 제출하면 성공한다 (회귀 가드)', async () => {
    const s = await seedSubmitEnv();
    const attId = await seedUnlinkedAttachment(s.pgUser.id);
    const r = await service.submit(submitInput(s.rfp.id, attId), {
      userId: s.pgUser.id,
      workspaceId: s.pgWs.id,
    });
    expect(r.ok).toBe(true);
  });

  it('제출자가 올리지 않은 남의 첨부는 INVALID_ATTACHMENT 로 거부한다 (보안 가드)', async () => {
    const s = await seedSubmitEnv();
    const stranger = await seedUser(db, { email: 'stranger@submit.com' });
    const attId = await seedUnlinkedAttachment(stranger.id);
    const r = await service.submit(submitInput(s.rfp.id, attId), {
      userId: s.pgUser.id,
      workspaceId: s.pgWs.id,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_ATTACHMENT');
  });
});
