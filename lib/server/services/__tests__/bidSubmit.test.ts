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
  bids,
  notifications,
  outboxEntries,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import { BidService } from '../bid';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: BidService;

async function buildService(): Promise<BidService> {
  const [bidRepo, invRepo, rfpRepo, outboxRepo, wsRepo, attRepo, bidNoteRepo] = await Promise.all([
    getBidRepo(), getInvitationRepo(), getRfpRepo(),
    getOutboxRepo(), getWorkspaceRepo(), getAttachmentRepo(), getBidNoteRepo(),
  ]);
  return new BidService(db, bidRepo, invRepo, rfpRepo, outboxRepo, wsRepo, attRepo, bidNoteRepo);
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

// ─── seed helpers ─────────────────────────────────────────────────────────────

async function seedSubmitEnv() {
  const buyerUser = await seedUser(db, { email: 'buyer@submit.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'pg@submit.com' });
  const pgWs = await seedPgWorkspace(db, 'pg-submit.io');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  const { id: rfpId, code: rfpCode } = await seedRfp(db, {
    buyerWsId: buyerWs.id,
    createdBy: buyerUser.id,
    code: 'P-2606-0099',
  });
  await db
    .update(rfps)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq(rfps.id, rfpId));
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    tokenHash: 'tok-submit-01',
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
    acceptedByUserId: pgUser.id,
  });
  return { buyerUser, buyerWs, pgUser, pgWs, rfpId, rfpCode, invId };
}

const BASE = {
  settleCycle: 'D+1' as const,
  settleLimit: 0,
  guaranteeInsurance: 0,
  paymentFees: {} as Record<string, number>,
  customFees: {} as Record<string, number>,
};

// ─── BidService.submit ────────────────────────────────────────────────────────

describe('BidService.submit', () => {
  it('returns FORBIDDEN when canAccess is false (no invitation)', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: randomUUID() },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN');
  });

  it('returns RFP_NOT_OPEN when rfp status is draft', async () => {
    const s = await seedSubmitEnv();
    await db.update(rfps).set({ status: 'draft', sentAt: null }).where(eq(rfps.id, s.rfpId));
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('RFP_NOT_OPEN');
  });

  it('returns PAYMENT_METHOD_NOT_REQUESTED when disallowed method submitted', async () => {
    const s = await seedSubmitEnv();
    await db
      .update(rfps)
      .set({ requiredPaymentMethods: ['card'] })
      .where(eq(rfps.id, s.rfpId));
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId, paymentFees: { bank_transfer: 0.01 } },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('PAYMENT_METHOD_NOT_REQUESTED');
  });

  it('returns BID_ALREADY_SUBMITTED when duplicate exists', async () => {
    const s = await seedSubmitEnv();
    const r1 = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r1.ok).toBe(true);
    const r2 = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error).toBe('BID_ALREADY_SUBMITTED');
  });

  it('saves bid and returns bidId + rfpCode', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bidId).toBeTruthy();
    expect(r.rfpCode).toBe(s.rfpCode);
    const rows = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pgWsId).toBe(s.pgWs.id);
  });

  it('dispatches in-app notification to buyer members', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, s.buyerUser.id));
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0]!.type).toBe('bid.submitted');
  });

  it('enqueues outbox email to buyer members', async () => {
    const s = await seedSubmitEnv();
    const r = await service.submit(
      { ...BASE, rfpId: s.rfpId },
      { userId: s.pgUser.id, workspaceId: s.pgWs.id },
    );
    expect(r.ok).toBe(true);
    const entries = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'bid.submitted'));
    expect(entries.length).toBeGreaterThan(0);
  });
});
