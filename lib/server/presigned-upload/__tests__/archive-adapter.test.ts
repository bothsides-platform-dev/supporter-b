/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { contractArchives } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { createArchiveUploadAdapter } from '../archive-adapter';
import {
  ARCHIVE_UPLOAD_CAP_PER_WORKSPACE,
  MAX_ARCHIVE_DOC_BYTES,
} from '@/lib/contract-archive/limits';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

afterEach(() => {
  __resetForTest();
});

describe('archive upload adapter', () => {
  it('rejects missing workspace and oversized uploads with semantic reasons', async () => {
    const adapter = createArchiveUploadAdapter();

    await expect(
      adapter.createPending(
        { userId: randomUUID() },
        { name: 'contract.pdf', size: 10, title: '계약서' },
        randomUUID(),
      ),
    ).resolves.toEqual({ kind: 'rejected', reason: 'forbidden' });
    await expect(
      adapter.createPending(
        { userId: randomUUID(), workspaceId: randomUUID() },
        { name: 'contract.pdf', size: MAX_ARCHIVE_DOC_BYTES + 1, title: '계약서' },
        randomUUID(),
      ),
    ).resolves.toEqual({ kind: 'rejected', reason: 'file-too-large' });
  });

  it('maps archive metadata to its upload-only pending descriptor', async () => {
    const user = await seedUser(db, { email: 'archive@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = { userId: user.id, workspaceId: workspace.id };
    const id = randomUUID();
    const adapter = createArchiveUploadAdapter();

    const created = await adapter.createPending(
      actor,
      {
        name: 'signed.pdf',
        size: 456,
        title: '2026 계약서',
        counterpartyName: '파트너사',
        contractedAt: new Date('2026-09-05T00:00:00Z'),
      },
      id,
    );

    expect(created).toEqual({
      kind: 'pending',
      upload: {
        id,
        key: `contract-archives/upload/${id}`,
        size: 456,
        mime: 'application/pdf',
        ready: { id },
      },
    });
    await expect(adapter.inspect(actor, id)).resolves.toEqual(created);
  });

  it('enforces the workspace upload cap inside the adapter', async () => {
    const user = await seedUser(db, { email: 'archive-cap@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = { userId: user.id, workspaceId: workspace.id };
    const adapter = createArchiveUploadAdapter();

    for (let index = 0; index < ARCHIVE_UPLOAD_CAP_PER_WORKSPACE; index += 1) {
      const result = await adapter.createPending(
        actor,
        { name: `${index}.pdf`, size: 10, title: `계약서 ${index}` },
        randomUUID(),
      );
      expect(result.kind).toBe('pending');
    }

    await expect(
      adapter.createPending(
        actor,
        { name: 'overflow.pdf', size: 10, title: '초과 계약서' },
        randomUUID(),
      ),
    ).resolves.toEqual({ kind: 'rejected', reason: 'upload-limit' });
  });

  it('hides foreign and signing-source rows and rejects malformed upload state', async () => {
    const owner = await seedUser(db, { email: 'archive-owner@adapter.test' });
    const foreign = await seedUser(db, { email: 'archive-foreign@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const adapter = createArchiveUploadAdapter();
    const ownerActor = { userId: owner.id, workspaceId: workspace.id };
    const created = await adapter.createPending(
      ownerActor,
      { name: 'owned.pdf', size: 10, title: '소유 계약서' },
      randomUUID(),
    );
    if (created.kind !== 'pending') throw new Error('expected pending upload');

    await expect(
      adapter.inspect({ userId: foreign.id, workspaceId: workspace.id }, created.upload.id),
    ).resolves.toEqual({ kind: 'rejected', reason: 'not-found' });

    const signingId = randomUUID();
    await db.insert(contractArchives).values({
      id: signingId,
      workspaceId: workspace.id,
      source: 'signing',
      title: '서명 보관본',
      createdBy: owner.id,
    });
    await expect(adapter.inspect(ownerActor, signingId)).resolves.toEqual({
      kind: 'rejected',
      reason: 'not-found',
    });

    const malformedId = randomUUID();
    await db.insert(contractArchives).values({
      id: malformedId,
      workspaceId: workspace.id,
      source: 'upload',
      title: '불완전 업로드',
      createdBy: owner.id,
    });
    await expect(adapter.inspect(ownerActor, malformedId)).resolves.toEqual({
      kind: 'rejected',
      reason: 'invalid-state',
    });
  });

  it('distinguishes the winning archive ready transition from an idempotent retry', async () => {
    const user = await seedUser(db, { email: 'archive-ready@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = { userId: user.id, workspaceId: workspace.id };
    const adapter = createArchiveUploadAdapter();
    const created = await adapter.createPending(
      actor,
      { name: 'signed.pdf', size: 456, title: '계약서' },
      randomUUID(),
    );
    if (created.kind !== 'pending') throw new Error('expected pending upload');

    await expect(adapter.commitReady(created.upload)).resolves.toBe('committed');
    await expect(adapter.commitReady(created.upload)).resolves.toBe('already-ready');
  });

  it('removes an invalid upload without touching other archive sources', async () => {
    const user = await seedUser(db, { email: 'archive-remove@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = { userId: user.id, workspaceId: workspace.id };
    const adapter = createArchiveUploadAdapter();
    const created = await adapter.createPending(
      actor,
      { name: 'bad.pdf', size: 20, title: '잘못된 계약서' },
      randomUUID(),
    );
    if (created.kind !== 'pending') throw new Error('expected pending upload');

    await adapter.remove(created.upload);

    await expect(adapter.inspect(actor, created.upload.id)).resolves.toEqual({
      kind: 'rejected',
      reason: 'not-found',
    });
  });

  it('takes only stale upload rows and returns their archive storage keys', async () => {
    const user = await seedUser(db, { email: 'archive-stale@adapter.test' });
    const biz = await seedBizProfile(db);
    const workspace = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    const actor = { userId: user.id, workspaceId: workspace.id };
    const adapter = createArchiveUploadAdapter();
    const created = await adapter.createPending(
      actor,
      { name: 'stale.pdf', size: 20, title: '오래된 계약서' },
      randomUUID(),
    );
    if (created.kind !== 'pending') throw new Error('expected pending upload');
    await db
      .update(contractArchives)
      .set({ createdAt: new Date('2026-09-01T00:00:00Z') })
      .where(eq(contractArchives.id, created.upload.id));

    await expect(
      adapter.takeStale(new Date('2026-09-02T00:00:00Z'), 200),
    ).resolves.toEqual([{ key: created.upload.key }]);
    await expect(adapter.inspect(actor, created.upload.id)).resolves.toMatchObject({
      kind: 'rejected',
    });
  });
});
