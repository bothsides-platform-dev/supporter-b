/**
 * POST /api/files/upload — multipart file upload.
 *
 * Auth: `auth()` required. 401 if no session.
 *
 * Validation pipeline (3 layers — all server-enforced):
 *   1. Size: <= 20MB (client headers ignored).
 *   2. Stated mime: must be one of pdf/png/jpeg.
 *   3. Magic-byte sniff: file head must match the stated mime.
 *
 * For `bid_proposal`: only PG sessions with `canAccess(rfpId, userId)`
 *   may upload (and `ownerId` must reference an existing RFP).
 * For `rfp`: buyer sessions only. `ownerId` may be a placeholder
 *   (`__draft__`) when the RFP is still being authored — the action
 *   `createRfpAction` later patches the row's `ownerId` to the real
 *   RFP id once the form is submitted.
 *
 * DB-then-storage ordering (what the code below actually does):
 *   1. Sniff + validate buffer.
 *   2. `attachmentRepo.save({...})` — metadata row first (key = row id).
 *   3. `getStorage().save(id, buffer, mime)`.
 *   4. If step 3 throws — best-effort `attachmentRepo.remove(id)`. If that
 *      compensation also fails, the leftover is a row whose object is
 *      missing; the download route serves 410 for it.
 *
 * Orphan rows from interrupted uploads are NOT cleaned up in v0, and the
 * planned R2 sweeper (TODOS.md) only reaps the opposite direction
 * (objects with no row) — row-without-object cleanup remains manual.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getAttachmentRepo } from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { MAX_BYTES } from '@/lib/server/storage/constants';
import { sniffMime, type AcceptedMime } from '@/lib/server/storage/sniff';
import { authorizeAttachmentUpload, OWNER_KINDS } from '../_upload-acl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIMES = new Set<AcceptedMime>([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

const MetaInput = z
  .object({
    ownerKind: z.enum(OWNER_KINDS),
    ownerId: z.string().min(1).max(64),
  })
  .strict();

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  // 이메일 미인증 세션 거부 — 서버 경계 강제 (C4).
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'INVALID_MULTIPART');
  }

  const rawFile = form.get('file');
  if (!(rawFile instanceof File)) return fail(400, 'FILE_REQUIRED');
  const file = rawFile;

  const meta = MetaInput.safeParse({
    ownerKind: form.get('ownerKind'),
    ownerId: form.get('ownerId'),
  });
  if (!meta.success) return fail(400, 'INVALID_INPUT');

  // Size cap (server-enforced; client header is advisory).
  if (file.size <= 0) return fail(400, 'EMPTY_FILE');
  if (file.size > MAX_BYTES) return fail(413, 'FILE_TOO_LARGE');

  // Header mime gate (cheap reject before reading the body).
  const headerMime = file.type;
  if (!ALLOWED_MIMES.has(headerMime as AcceptedMime)) {
    return fail(415, 'MIME_NOT_ALLOWED');
  }

  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  // Magic-byte sniff — third gate. Stated mime must equal sniffed mime.
  const sniffed = sniffMime(buffer);
  if (!sniffed || sniffed !== headerMime) {
    return fail(415, 'MIME_MISMATCH');
  }

  // Per-ownerKind ACL on the upload itself (shared with the presign route).
  const userId = session.user.id;
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  const wsType = (session.user as { workspaceType?: 'buyer' | 'pg' })
    .workspaceType;

  const authz = await authorizeAttachmentUpload(
    { userId, workspaceId: wsId, workspaceType: wsType },
    { ownerKind: meta.data.ownerKind, ownerId: meta.data.ownerId },
  );
  if (!authz.ok) return fail(authz.status, authz.error);

  // DB metadata first, blob second — the R2 object at attachments/<id> (C4)
  // is only ever referenced once the attachments row exists. The storage
  // key is the attachment id.
  const id = randomUUID();
  const repo = await getAttachmentRepo();
  const rfpLink = authz.rfpLink;

  await repo.save({
    id,
    name: file.name,
    size: file.size,
    mimeType: sniffed,
    uploadedBy: userId,
    url: '', // url is route-resolved (`/api/files/{id}`) on the client.
    ...rfpLink,
  });

  try {
    await getStorage().save(id, buffer, sniffed);
    return NextResponse.json({
      id,
      name: file.name,
      size: file.size,
      mimeType: sniffed,
    });
  } catch (err) {
    // Blob write failed — drop the orphan metadata row (best-effort).
    await repo.remove(id).catch(() => {});
    throw err;
  }
}
