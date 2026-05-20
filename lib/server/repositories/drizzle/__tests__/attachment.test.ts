// DrizzleAttachmentRepository — Attachment.url 계약 검증.
// Repo는 Attachment.url 필드를 `/api/files/{id}` 형태로 노출해야 한다. 스토리지
// 키는 attachment.id 자체이므로 별도 storagePath 컬럼이 없다(C4). 소유는
// exclusive-arc(rfpId/bidId/bidNoteId) — 미링크 드래프트는 셋 다 undefined.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleAttachmentRepository } from '../attachment';
import { seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const uploader = await seedUser(db, { email: 'uploader@x.com' });
  const repo = new DrizzleAttachmentRepository(db);
  return { db, uploader, repo };
}

// Draft attachment — all owner FKs null (valid: num_nonnulls <= 1).
async function insertAttachment(db: PgliteDB, uploaderId: string) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name: 'spec.pdf',
    size: 1024,
    mimeType: 'application/pdf',
    uploadedBy: uploaderId,
  });
  return id;
}

describe('DrizzleAttachmentRepository.findById', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('exposes url as the authenticated /api/files/{id} route', async () => {
    const id = await insertAttachment(ctx.db, ctx.uploader.id);

    const row = await ctx.repo.findById(id);

    expect(row).toBeDefined();
    expect(row!.url).toBe(`/api/files/${id}`);
    expect(row!.uploadedBy).toBe(ctx.uploader.id);
    // Draft: no owner linked yet.
    expect(row!.rfpId).toBeUndefined();
    expect(row!.bidId).toBeUndefined();
    expect(row!.bidNoteId).toBeUndefined();
  });

  it('returns undefined for unknown id', async () => {
    expect(await ctx.repo.findById(randomUUID())).toBeUndefined();
  });
});
