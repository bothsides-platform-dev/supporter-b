// addBidNoteAction tests.
//
// Coverage:
//   - rejects without buyer session
//   - rejects empty body + empty attachments
//   - rejects unknown bid
//   - rejects buyer outside the bid's workspace
//   - rejects attachment that doesn't belong to this bid_note draft
//   - happy path: note row created + attachments re-parented to noteId
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  attachments,
  bidNotes,
  bids,
  rfps,
  rfpInvitations,
} from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import {
  setupRfpActionEnv,
  teardownRfpActionEnv,
} from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      name?: string;
      workspaceId: string;
      workspaceType: 'buyer';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requirePgSession: () => Promise.reject(new Error('FORBIDDEN_PG')),
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { addBidNoteAction } from '../addBidNoteAction';

let db: PgliteDB;

async function setup() {
  const buyer = await seedUser(db, { email: 'b@buyer.com', name: '구매' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'sales@toss.im' });

  const rfpId = 'P-2605-4001';
  await db.insert(rfps).values({
    id: rfpId,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'note action test',
    memo: '',
    allowedPgWorkspaceIds: [pgWs.id],
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    acceptedByUserId: pgUser.id,
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
    deposit: '0',
    setupFee: '0',
    monthlyMin: '0',
    bankTransferFeePct: '0.015',
    easyPayFeePct: '0.018',
    proposalAttachmentId: null,
    submittedBy: pgUser.id,
  });

  return { buyer, buyerWs, bidId, rfpId };
}

async function preStageAttachment(
  bidId: string,
  uploaderId: string,
  name = 'memo.pdf',
) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    ownerKind: 'bid_note',
    ownerId: bidId, // draft window: owner_id is the bid id until note exists
    name,
    size: 100,
    mimeType: 'application/pdf',
    storagePath: `2026/05/${id}.pdf`,
    uploadedBy: uploaderId,
  });
  return id;
}

describe('addBidNoteAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without buyer session', async () => {
    sessionRef.value = null;
    const r = await addBidNoteAction({
      bidId: randomUUID(),
      body: 'x',
      attachmentIds: [],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects empty body AND empty attachments', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.buyer.id,
        email: s.buyer.email,
        workspaceId: s.buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await addBidNoteAction({
      bidId: s.bidId,
      body: '   ',
      attachmentIds: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NOTE_EMPTY');
  });

  it('rejects unknown bid', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.buyer.id,
        email: s.buyer.email,
        workspaceId: s.buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await addBidNoteAction({
      bidId: randomUUID(),
      body: 'hello',
      attachmentIds: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('BID_NOT_FOUND');
  });

  it('rejects buyer from a different workspace', async () => {
    const s = await setup();
    const foreign = await seedUser(db, { email: 'foreign@x.com' });
    const foreignBiz = await seedBizProfile(db, { bizNo: '2222222222' });
    const foreignWs = await seedBuyerWorkspace(db, {
      bizProfileId: foreignBiz.id,
    });
    await seedMembership(db, foreignWs.id, foreign.id, 'admin');
    sessionRef.value = {
      user: {
        id: foreign.id,
        email: foreign.email,
        workspaceId: foreignWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await addBidNoteAction({
      bidId: s.bidId,
      body: 'hi',
      attachmentIds: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('rejects attachment that does not belong to this bid_note draft', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.buyer.id,
        email: s.buyer.email,
        workspaceId: s.buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    // Owner_kind='rfp' attachment — not a bid_note draft; reject.
    const wrongId = randomUUID();
    await db.insert(attachments).values({
      id: wrongId,
      ownerKind: 'rfp',
      ownerId: 'P-2605-4001',
      name: 'wrong.pdf',
      size: 10,
      mimeType: 'application/pdf',
      storagePath: '2026/05/wrong.pdf',
      uploadedBy: s.buyer.id,
    });
    const r = await addBidNoteAction({
      bidId: s.bidId,
      body: 'x',
      attachmentIds: [wrongId],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_ATTACHMENT');
  });

  it('happy path: note row created + attachments re-parented to noteId', async () => {
    const s = await setup();
    sessionRef.value = {
      user: {
        id: s.buyer.id,
        email: s.buyer.email,
        workspaceId: s.buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const att1 = await preStageAttachment(s.bidId, s.buyer.id, 'a.pdf');
    const att2 = await preStageAttachment(s.bidId, s.buyer.id, 'b.pdf');

    const r = await addBidNoteAction({
      bidId: s.bidId,
      body: '본사 컨펌 후 회신',
      attachmentIds: [att1, att2],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.noteId).toBeDefined();

    // Note row exists.
    const [note] = await db
      .select()
      .from(bidNotes)
      .where(eq(bidNotes.id, r.noteId));
    expect(note?.bidId).toBe(s.bidId);
    expect(note?.body).toBe('본사 컨펌 후 회신');
    expect(note?.authorId).toBe(s.buyer.id);

    // Both attachments now point at noteId.
    const rows = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.ownerKind, 'bid_note'),
          eq(attachments.ownerId, r.noteId),
        ),
      );
    expect(rows.map((r2) => r2.id).sort()).toEqual([att1, att2].sort());
  });
});
