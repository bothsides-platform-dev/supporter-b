/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { attachments, bids, rfpInvitations } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { DRAFT_OWNER_ID } from '@/lib/server/storage/path';
import { MAX_BYTES } from '@/lib/server/storage/constants';
import { createAttachmentUploadAdapter } from '../attachment-adapter';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

afterEach(() => {
  __resetForTest();
});

describe('attachment upload adapter', () => {
  it('keeps completion rejections narrower than presign policy rejections', () => {
    type Adapter = ReturnType<typeof createAttachmentUploadAdapter>;
    type Inspection = Awaited<ReturnType<Adapter['inspect']>>;
    type InspectionRejection = Extract<Inspection, { kind: 'rejected' }>['reason'];

    expectTypeOf<InspectionRejection>().toEqualTypeOf<'not-found' | 'forbidden'>();
  });

  it.each([
    { ownerKind: 'rfp', workspaceType: 'pg' },
    { ownerKind: 'bid_proposal', workspaceType: 'buyer' },
    { ownerKind: 'bid_note', workspaceType: 'pg' },
    { ownerKind: 'chat', workspaceType: undefined },
    { ownerKind: 'team_message', workspaceType: undefined },
  ] as const)('rejects disallowed $ownerKind ownership with a semantic reason', async ({
    ownerKind,
    workspaceType,
  }) => {
    const adapter = createAttachmentUploadAdapter();

    await expect(
      adapter.createPending(
        { userId: randomUUID(), workspaceType },
        {
          ownerKind,
          ownerId: DRAFT_OWNER_ID,
          name: 'proposal.pdf',
          size: 10,
          mime: 'application/pdf',
        },
        randomUUID(),
      ),
    ).resolves.toEqual({ kind: 'rejected', reason: 'forbidden' });
  });

  it.each([
    { size: MAX_BYTES + 1, mime: 'application/pdf', reason: 'file-too-large' },
    { size: 10, mime: 'text/html', reason: 'mime-not-allowed' },
  ])('rejects attachment policy violations: $reason', async ({ size, mime, reason }) => {
    const adapter = createAttachmentUploadAdapter();

    await expect(
      adapter.createPending(
        { userId: randomUUID(), workspaceId: randomUUID(), workspaceType: 'buyer' },
        { ownerKind: 'rfp', ownerId: DRAFT_OWNER_ID, name: 'proposal.pdf', size, mime },
        randomUUID(),
      ),
    ).resolves.toEqual({ kind: 'rejected', reason });
  });

  it('maps an authorized draft attachment to a pending upload descriptor', async () => {
    const user = await seedUser(db, { email: 'buyer@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = {
      userId: user.id,
      workspaceId: workspace.id,
      workspaceType: 'buyer' as const,
    };
    const id = randomUUID();
    const adapter = createAttachmentUploadAdapter();

    const created = await adapter.createPending(
      actor,
      {
        ownerKind: 'rfp',
        ownerId: DRAFT_OWNER_ID,
        name: 'proposal.pdf',
        size: 321,
        mime: 'application/pdf',
      },
      id,
    );

    expect(created).toEqual({
      kind: 'pending',
      upload: {
        id,
        key: id,
        size: 321,
        mime: 'application/pdf',
        ready: {
          id,
          name: 'proposal.pdf',
          size: 321,
          mimeType: 'application/pdf',
        },
      },
    });
    await expect(adapter.inspect(actor, id)).resolves.toEqual(created);

    const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
    expect(row).toMatchObject({
      id,
      uploadedBy: user.id,
      name: 'proposal.pdf',
      size: 321,
      mimeType: 'application/pdf',
      status: 'pending',
      rfpId: null,
    });
  });

  it('persists an owned non-draft RFP association and hides a foreign RFP', async () => {
    const owner = await seedUser(db, { email: 'rfp-owner@adapter.test' });
    const ownerWs = await seedBuyerWorkspace(db);
    const foreignWs = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: ownerWs.id, createdBy: owner.id });
    const adapter = createAttachmentUploadAdapter();
    const input = {
      ownerKind: 'rfp' as const,
      ownerId: rfp.id,
      name: 'rfp.pdf',
      size: 20,
      mime: 'application/pdf',
    };
    const id = randomUUID();

    await expect(
      adapter.createPending(
        { userId: owner.id, workspaceId: foreignWs.id, workspaceType: 'buyer' },
        input,
        randomUUID(),
      ),
    ).resolves.toEqual({ kind: 'rejected', reason: 'forbidden' });
    await expect(
      adapter.createPending(
        { userId: owner.id, workspaceId: ownerWs.id, workspaceType: 'buyer' },
        input,
        id,
      ),
    ).resolves.toMatchObject({ kind: 'pending' });

    const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
    expect(row).toMatchObject({ rfpId: rfp.id, uploadedBy: owner.id, status: 'pending' });
  });

  it('requires an invitation for bid proposals and PG team messages', async () => {
    const buyer = await seedUser(db, { email: 'invite-buyer@adapter.test' });
    const buyerWs = await seedBuyerWorkspace(db);
    const invitedPgWs = await seedPgWorkspace(db, 'invited-pg');
    const uninvitedPgWs = await seedPgWorkspace(db, 'uninvited-pg');
    const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    await db.insert(rfpInvitations).values({
      id: randomUUID(),
      rfpId: rfp.id,
      pgWsId: invitedPgWs.id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'accepted',
    });
    const adapter = createAttachmentUploadAdapter();

    for (const ownerKind of ['bid_proposal', 'team_message'] as const) {
      const input = {
        ownerKind,
        ownerId: rfp.id,
        name: `${ownerKind}.pdf`,
        size: 20,
        mime: 'application/pdf',
      };
      await expect(
        adapter.createPending(
          { userId: buyer.id, workspaceId: uninvitedPgWs.id, workspaceType: 'pg' },
          input,
          randomUUID(),
        ),
      ).resolves.toEqual({ kind: 'rejected', reason: 'forbidden' });
      await expect(
        adapter.createPending(
          { userId: buyer.id, workspaceId: invitedPgWs.id, workspaceType: 'pg' },
          input,
          randomUUID(),
        ),
      ).resolves.toMatchObject({ kind: 'pending' });
    }
  });

  it('authorizes buyer bid notes and team messages only for their own RFP', async () => {
    const buyer = await seedUser(db, { email: 'note-buyer@adapter.test' });
    const pg = await seedUser(db, { email: 'note-pg@adapter.test' });
    const buyerWs = await seedBuyerWorkspace(db);
    const foreignBuyerWs = await seedBuyerWorkspace(db);
    const pgWs = await seedPgWorkspace(db, 'note-pg');
    const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
    const invitationId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invitationId,
      rfpId: rfp.id,
      pgWsId: pgWs.id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'accepted',
    });
    const bidId = randomUUID();
    await db.insert(bids).values({
      id: bidId,
      rfpId: rfp.id,
      pgWsId: pgWs.id,
      invitationId,
      settleCycle: 'D+1',
      submittedBy: pg.id,
    });
    const adapter = createAttachmentUploadAdapter();
    const buyerActor = { userId: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer' as const };
    const foreignActor = {
      userId: buyer.id,
      workspaceId: foreignBuyerWs.id,
      workspaceType: 'buyer' as const,
    };

    await expect(
      adapter.createPending(buyerActor, {
        ownerKind: 'bid_note', ownerId: randomUUID(), name: 'missing.pdf', size: 20,
        mime: 'application/pdf',
      }, randomUUID()),
    ).resolves.toEqual({ kind: 'rejected', reason: 'bid-not-found' });
    for (const input of [
      { ownerKind: 'bid_note' as const, ownerId: bidId },
      { ownerKind: 'team_message' as const, ownerId: rfp.id },
    ]) {
      const upload = { ...input, name: `${input.ownerKind}.pdf`, size: 20, mime: 'application/pdf' };
      await expect(adapter.createPending(foreignActor, upload, randomUUID())).resolves.toEqual({
        kind: 'rejected', reason: 'forbidden',
      });
      await expect(adapter.createPending(buyerActor, upload, randomUUID())).resolves.toMatchObject({
        kind: 'pending',
      });
    }
  });

  it('allows chat uploads for any authenticated workspace', async () => {
    const user = await seedUser(db, { email: 'chat@adapter.test' });
    const adapter = createAttachmentUploadAdapter();
    await expect(
      adapter.createPending(
        { userId: user.id, workspaceId: randomUUID() },
        { ownerKind: 'chat', ownerId: randomUUID(), name: 'chat.pdf', size: 20,
          mime: 'application/pdf' },
        randomUUID(),
      ),
    ).resolves.toMatchObject({ kind: 'pending' });
  });

  it('distinguishes the winning ready transition from an idempotent retry', async () => {
    const user = await seedUser(db, { email: 'ready@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = {
      userId: user.id,
      workspaceId: workspace.id,
      workspaceType: 'buyer' as const,
    };
    const adapter = createAttachmentUploadAdapter();
    const created = await adapter.createPending(
      actor,
      {
        ownerKind: 'rfp',
        ownerId: DRAFT_OWNER_ID,
        name: 'proposal.pdf',
        size: 321,
        mime: 'application/pdf',
      },
      randomUUID(),
    );
    if (created.kind !== 'pending') throw new Error('expected pending upload');

    await expect(adapter.commitReady(created.upload)).resolves.toBe('committed');
    await expect(adapter.commitReady(created.upload)).resolves.toBe('already-ready');
    await expect(adapter.remove(created.upload)).resolves.toBe(false);
    await expect(adapter.inspect(actor, created.upload.id)).resolves.toMatchObject({
      kind: 'ready',
    });
  });

  it('removes an invalid pending upload from the attachment lifecycle', async () => {
    const user = await seedUser(db, { email: 'remove@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = {
      userId: user.id,
      workspaceId: workspace.id,
      workspaceType: 'buyer' as const,
    };
    const adapter = createAttachmentUploadAdapter();
    const created = await adapter.createPending(
      actor,
      {
        ownerKind: 'rfp',
        ownerId: DRAFT_OWNER_ID,
        name: 'bad.pdf',
        size: 12,
        mime: 'application/pdf',
      },
      randomUUID(),
    );
    if (created.kind !== 'pending') throw new Error('expected pending upload');

    await adapter.remove(created.upload);

    await expect(adapter.inspect(actor, created.upload.id)).resolves.toEqual({
      kind: 'rejected',
      reason: 'not-found',
    });
  });

  it('takes stale pending rows before returning their storage keys', async () => {
    const user = await seedUser(db, { email: 'stale@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = {
      userId: user.id,
      workspaceId: workspace.id,
      workspaceType: 'buyer' as const,
    };
    const adapter = createAttachmentUploadAdapter();
    const created = await adapter.createPending(
      actor,
      {
        ownerKind: 'rfp',
        ownerId: DRAFT_OWNER_ID,
        name: 'stale.pdf',
        size: 12,
        mime: 'application/pdf',
      },
      randomUUID(),
    );
    if (created.kind !== 'pending') throw new Error('expected pending upload');
    await db
      .update(attachments)
      .set({ uploadedAt: new Date('2026-09-01T00:00:00Z') })
      .where(eq(attachments.id, created.upload.id));

    await expect(
      adapter.takeStale(new Date('2026-09-02T00:00:00Z'), 200),
    ).resolves.toEqual([{ key: created.upload.key }]);
    await expect(adapter.inspect(actor, created.upload.id)).resolves.toMatchObject({
      kind: 'rejected',
    });
  });
});
