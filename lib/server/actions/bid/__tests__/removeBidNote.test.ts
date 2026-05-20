// removeBidNoteAction tests.
//
// Coverage:
//   - rejects without buyer session
//   - rejects unknown noteId
//   - rejects buyer outside the note's workspace
//   - happy path: note row + attachment rows gone; storage.delete called
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

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
import {
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
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

import { removeBidNoteAction } from '../removeBidNoteAction';

let db: PgliteDB;
const deleted: string[] = [];

function installStubStorage(): void {
  __setStorageForTest({
    async save() {
      /* not exercised here */
    },
    async read() {
      throw new Error('not exercised');
    },
    async delete(key: string) {
      deleted.push(key);
    },
  });
}

async function setup() {
  const buyer = await seedUser(db, { email: 'b@buyer.com', name: '구매' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'sales@toss.im' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-5001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'remove note test',
    memo: '',
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
    submittedBy: pgUser.id,
  });

  return { buyer, buyerWs, bidId };
}

async function seedNoteWithAttachment(bidId: string, authorId: string) {
  const noteId = randomUUID();
  await db.insert(bidNotes).values({
    id: noteId,
    bidId,
    authorId,
    body: 'will delete',
  });
  const attId = randomUUID();
  await db.insert(attachments).values({
    id: attId,
    bidNoteId: noteId,
    name: 'a.pdf',
    size: 100,
    mimeType: 'application/pdf',
    uploadedBy: authorId,
  });
  // Storage key is the attachment id (C4).
  return { noteId, attId };
}

describe('removeBidNoteAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    installStubStorage();
    deleted.length = 0;
  });
  afterEach(() => {
    __setStorageForTest(undefined);
    __resetStorageForTest();
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without buyer session', async () => {
    sessionRef.value = null;
    const r = await removeBidNoteAction({ noteId: randomUUID() });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown noteId', async () => {
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
    const r = await removeBidNoteAction({ noteId: randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NOTE_NOT_FOUND');
  });

  it('rejects buyer from a different workspace', async () => {
    const s = await setup();
    const { noteId } = await seedNoteWithAttachment(s.bidId, s.buyer.id);
    const foreign = await seedUser(db, { email: 'foreign@x.com' });
    const foreignBiz = await seedBizProfile(db, { bizNo: '3333333333' });
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
    const r = await removeBidNoteAction({ noteId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
  });

  it('happy path: note + attachment rows gone, storage.delete called', async () => {
    const s = await setup();
    const { noteId, attId } = await seedNoteWithAttachment(
      s.bidId,
      s.buyer.id,
    );
    sessionRef.value = {
      user: {
        id: s.buyer.id,
        email: s.buyer.email,
        workspaceId: s.buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await removeBidNoteAction({ noteId });
    expect(r.ok).toBe(true);

    expect(
      await db
        .select({ id: bidNotes.id })
        .from(bidNotes)
        .where(eq(bidNotes.id, noteId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: attachments.id })
        .from(attachments)
        .where(eq(attachments.id, attId)),
    ).toHaveLength(0);
    expect(deleted).toEqual([attId]);
  });
});
