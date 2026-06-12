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
  getInvitationRepo,
  getOutboxRepo,
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
import { BidService } from '../bid';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: BidService;

async function buildService(): Promise<BidService> {
  const [bidRepo, invRepo, rfpRepo, outboxRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo] =
    await Promise.all([
      getBidRepo(), getInvitationRepo(), getRfpRepo(),
      getOutboxRepo(), getWorkspaceRepo(), getAttachmentRepo(), getBidNoteRepo(),
      getRfpRequoteRequestRepo(), getAuditLogRepo(),
    ]);
  return new BidService(db, bidRepo, invRepo, rfpRepo, outboxRepo, wsRepo, attRepo, bidNoteRepo, requoteRepo, auditRepo);
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});

afterEach(() => {
  __resetForTest();
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
