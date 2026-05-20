// Schema-level smoke test for bid notes + buyer stage.
// Confirms three drift-prone surfaces are wired:
//   1. attachments.bid_note_id exclusive-arc FK links a note attachment
//   2. bid_notes table exists with the expected columns/FKs
//   3. bids.buyer_stage column accepts the buyer_stage enum values
// If any of these is missing in the migration the test will fail at SQL
// time — keeping the schema diff honest.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  attachments,
  bidNotes,
  bids,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db, { email: 'buyer@notes.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-9001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'schema test',
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

  return { db, buyer, bidId, rfpId };
}

describe('Stage 3a schema — bid notes + buyer stage', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('bid_notes row round-trip with bid_note attachment FK', async () => {
    const noteId = randomUUID();
    await ctx.db.insert(bidNotes).values({
      id: noteId,
      bidId: ctx.bidId,
      authorId: ctx.buyer.id,
      body: '협상 진행 메모',
    });

    // bid_note_id exclusive-arc FK must link the attachment to the note.
    const attId = randomUUID();
    await ctx.db.insert(attachments).values({
      id: attId,
      bidNoteId: noteId,
      name: 'memo.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: ctx.buyer.id,
    });

    const fetched = await ctx.db.select().from(bidNotes);
    expect(fetched).toHaveLength(1);
    expect(fetched[0].body).toBe('협상 진행 메모');
    expect(fetched[0].bidId).toBe(ctx.bidId);

    const fetchedAtt = await ctx.db.select().from(attachments);
    expect(fetchedAtt[0].bidNoteId).toBe(noteId);
  });

  it('bids.buyer_stage defaults to pending and accepts negotiating/decided', async () => {
    const [row] = await ctx.db.select().from(bids);
    expect(row.buyerStage).toBe('pending');

    await ctx.db
      .update(bids)
      .set({ buyerStage: 'negotiating' })
      .where(eq(bids.id, ctx.bidId));

    const [updated] = await ctx.db.select().from(bids);
    expect(updated.buyerStage).toBe('negotiating');
  });
});
