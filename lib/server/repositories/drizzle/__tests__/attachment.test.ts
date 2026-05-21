// DrizzleAttachmentRepository — Attachment.url 계약 검증.
// Repo는 Attachment.url 필드를 `/api/files/{id}` 형태로 노출해야 한다. 스토리지
// 키는 attachment.id 자체이므로 별도 storagePath 컬럼이 없다(C4). 소유는
// exclusive-arc(rfpId/bidId/bidNoteId) — 미링크 드래프트는 셋 다 undefined.

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleAttachmentRepository } from '../attachment';
import { seedBuyerWorkspace, seedRfp, seedUser } from './_seed';

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

// RFP-owned attachment with explicit uploadedAt for deterministic ordering.
async function insertRfpAttachment(
  db: PgliteDB,
  opts: { uploaderId: string; rfpId: string; name: string; uploadedAt: Date },
) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name: opts.name,
    size: 2048,
    mimeType: 'application/pdf',
    uploadedBy: opts.uploaderId,
    rfpId: opts.rfpId,
    uploadedAt: opts.uploadedAt,
  });
  return id;
}

describe('DrizzleAttachmentRepository.findByRfp', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns only the given rfp attachments, oldest first, with the route url', async () => {
    const ws = await seedBuyerWorkspace(ctx.db);
    const rfp = await seedRfp(ctx.db, {
      buyerWsId: ws.id,
      createdBy: ctx.uploader.id,
    });
    const other = await seedRfp(ctx.db, {
      buyerWsId: ws.id,
      createdBy: ctx.uploader.id,
    });

    const second = await insertRfpAttachment(ctx.db, {
      uploaderId: ctx.uploader.id,
      rfpId: rfp.id,
      name: 'second.pdf',
      uploadedAt: new Date('2026-05-02T00:00:00Z'),
    });
    const first = await insertRfpAttachment(ctx.db, {
      uploaderId: ctx.uploader.id,
      rfpId: rfp.id,
      name: 'first.pdf',
      uploadedAt: new Date('2026-05-01T00:00:00Z'),
    });
    // Noise: another RFP's attachment + a draft (no owner) — must be excluded.
    await insertRfpAttachment(ctx.db, {
      uploaderId: ctx.uploader.id,
      rfpId: other.id,
      name: 'other.pdf',
      uploadedAt: new Date('2026-05-01T00:00:00Z'),
    });
    await insertAttachment(ctx.db, ctx.uploader.id);

    const files = await ctx.repo.findByRfp(rfp.id);

    expect(files.map((f) => f.id)).toEqual([first, second]);
    expect(files.map((f) => f.name)).toEqual(['first.pdf', 'second.pdf']);
    expect(files[0].url).toBe(`/api/files/${first}`);
    // 공개 Attachment 필드만 — uploadedBy/rfpId 등 record 전용 필드가 클라이언트로 새지 않게.
    expect(Object.keys(files[0]).sort()).toEqual([
      'id',
      'mimeType',
      'name',
      'size',
      'url',
    ]);
  });

  it('returns [] for an rfp with no attachments', async () => {
    const ws = await seedBuyerWorkspace(ctx.db);
    const rfp = await seedRfp(ctx.db, {
      buyerWsId: ws.id,
      createdBy: ctx.uploader.id,
    });

    expect(await ctx.repo.findByRfp(rfp.id)).toEqual([]);
  });
});
