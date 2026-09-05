/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { attachments } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
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
