// DrizzleBidNoteRepository — buyer-side notes attached to a bid.
//   - save() inserts a note row.
//   - findByBid() returns notes (oldest → newest) with hydrated attachments
//     (owner_kind='bid_note', owner_id=note.id) projected through the
//     `Attachment.url = /api/files/{id}` contract.
//   - remove() deletes the note row; cascade deletes are not exercised here
//     because attachments stay (cleanup is a separate orphan sweeper).

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  attachments,
  bids,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleBidNoteRepository } from '../bid-note';
import { generateToken, hashToken, addMinutes } from '../../../token';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db, { email: 'buyer@notes.com', name: '구매' });
  const peer = await seedUser(db, { email: 'peer@notes.com', name: '동료' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-9101',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'note repo test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });
  const invitationId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invitationId,
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
    invitationId,
    settleCycle: 'D+1',
    deposit: '0',
    setupFee: '0',
    monthlyMin: '0',
    bankTransferFeePct: '0.015',
    easyPayFeePct: '0.018',
    submittedBy: pgUser.id,
  });

  return {
    db,
    repo: new DrizzleBidNoteRepository(db),
    bidId,
    buyer,
    peer,
  };
}

async function insertAttachment(
  db: PgliteDB,
  noteId: string,
  uploaderId: string,
  name = 'memo.pdf',
) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    bidNoteId: noteId,
    name,
    size: 1024,
    mimeType: 'application/pdf',
    uploadedBy: uploaderId,
  });
  return id;
}

describe('DrizzleBidNoteRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('save() persists a note row that findByBid() returns', async () => {
    const noteId = randomUUID();
    await ctx.repo.save({
      id: noteId,
      bidId: ctx.bidId,
      authorId: ctx.buyer.id,
      body: '본사 컨펌 후 회신 예정',
      createdAt: new Date(),
    });
    const list = await ctx.repo.findByBid(ctx.bidId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(noteId);
    expect(list[0].body).toBe('본사 컨펌 후 회신 예정');
    expect(list[0].authorName).toBe('구매');
    expect(list[0].attachments).toEqual([]);
  });

  it('findByBid() returns notes oldest → newest with bid_note attachments hydrated', async () => {
    const earlierId = randomUUID();
    const laterId = randomUUID();
    await ctx.repo.save({
      id: earlierId,
      bidId: ctx.bidId,
      authorId: ctx.buyer.id,
      body: '첫 메모',
      createdAt: new Date(Date.now() - 10_000),
    });
    await ctx.repo.save({
      id: laterId,
      bidId: ctx.bidId,
      authorId: ctx.peer.id,
      body: '두 번째 메모',
      createdAt: new Date(),
    });
    const attEarly = await insertAttachment(ctx.db, earlierId, ctx.buyer.id);
    const attLate = await insertAttachment(
      ctx.db,
      laterId,
      ctx.peer.id,
      'late.pdf',
    );

    const list = await ctx.repo.findByBid(ctx.bidId);

    expect(list.map((n) => n.id)).toEqual([earlierId, laterId]);
    expect(list[0].authorName).toBe('구매');
    expect(list[1].authorName).toBe('동료');
    expect(list[0].attachments).toHaveLength(1);
    expect(list[0].attachments[0].id).toBe(attEarly);
    expect(list[0].attachments[0].url).toBe(`/api/files/${attEarly}`);
    expect(list[1].attachments[0].id).toBe(attLate);
    expect(list[1].attachments[0].url).toBe(`/api/files/${attLate}`);
  });

  it('remove() deletes a note; subsequent findByBid() excludes it', async () => {
    const noteId = randomUUID();
    await ctx.repo.save({
      id: noteId,
      bidId: ctx.bidId,
      authorId: ctx.buyer.id,
      body: 'tmp',
      createdAt: new Date(),
    });
    expect(await ctx.repo.findByBid(ctx.bidId)).toHaveLength(1);

    await ctx.repo.remove(noteId);
    expect(await ctx.repo.findByBid(ctx.bidId)).toHaveLength(0);
  });
});
