// DrizzleAttachmentRepository — Attachment.url 계약 검증.
// Repo는 Attachment.url 필드를 `/api/files/{id}` 형태로 노출해야 한다 (계약은
// app/api/files/upload/route.ts:169 주석 참조). storagePath는 서버 내부용 별도
// 필드로 유지되어 ACL/스토리지 레이어에서만 사용된다.

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

async function insertAttachment(
  db: PgliteDB,
  uploaderId: string,
  overrides?: { storagePath?: string; ownerKind?: 'rfp' | 'bid_proposal' },
) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    ownerKind: overrides?.ownerKind ?? 'rfp',
    ownerId: 'P-2605-0001',
    name: 'spec.pdf',
    size: 1024,
    mimeType: 'application/pdf',
    storagePath: overrides?.storagePath ?? '2026/05/spec-xyz.pdf',
    uploadedBy: uploaderId,
  });
  return id;
}

describe('DrizzleAttachmentRepository.findById', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('exposes url as the authenticated /api/files/{id} route, not the raw storage path', async () => {
    const id = await insertAttachment(ctx.db, ctx.uploader.id, {
      storagePath: '2026/05/raw-key.pdf',
    });

    const row = await ctx.repo.findById(id);

    expect(row).toBeDefined();
    expect(row!.url).toBe(`/api/files/${id}`);
    // storagePath 는 서버 전용 필드로 row에 그대로 보존되어야 ACL/스토리지가 사용 가능.
    expect(row!.storagePath).toBe('2026/05/raw-key.pdf');
  });

  it('returns undefined for unknown id', async () => {
    expect(await ctx.repo.findById(randomUUID())).toBeUndefined();
  });
});
