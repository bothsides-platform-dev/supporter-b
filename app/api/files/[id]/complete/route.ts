/**
 * POST /api/files/{id}/complete — phase 2 of the two-phase presigned upload.
 *
 * The client calls this after PUTting bytes directly to the presigned URL
 * minted by `POST /api/files/presign`. This route independently re-verifies
 * the object (never trusts the client's say-so) and flips the row from
 * `status: 'pending'` to `status: 'ready'` — only a ready row is visible
 * anywhere else (list queries, `claim()`, the download route).
 *
 * Verification order (each failure is terminal for that call):
 *   1. `storage.head(id)` — ENOENT means the PUT hasn't landed (or is still
 *      in flight). The row is KEPT (not an error state) so the client can
 *      retry the PUT and call complete again; an abandoned pending row is
 *      reaped by the sweeper (`attachmentRepo.deleteStalePending`).
 *   2. Size check — `head.size !== row.size`. Content-Length is part of the
 *      presigned signature, so a well-behaved client can't produce this;
 *      it's a defense-in-depth layer only. Terminal: object + row deleted.
 *   3. Magic-byte sniff — read the first 4KB and compare against the
 *      declared mime. Terminal: object + row deleted.
 *   4. `markReady(id)` — flips status; only succeeds once (idempotent via
 *      the `status === 'ready'` fast-path above).
 *
 * Auth: only the uploader may complete their own upload (`att.uploadedBy
 * !== session.user.id` -> 403). Same 3-layer session gate as the other
 * file routes.
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getAttachmentRepo } from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { sniffMime } from '@/lib/server/storage/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SNIFF_BYTES = 4096;

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

async function readSniffBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks as unknown as Uint8Array[]);
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  // 이메일 미인증 세션 거부 — 서버 경계 강제 (C4).
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  const { id } = await ctx.params;
  if (!id) return fail(400, 'INVALID_INPUT');

  const repo = await getAttachmentRepo();
  const att = await repo.findById(id);
  if (!att) return fail(404, 'NOT_FOUND');

  if (att.uploadedBy !== session.user.id) return fail(403, 'FORBIDDEN');

  if (att.status === 'ready') {
    return NextResponse.json({
      id: att.id,
      name: att.name,
      size: att.size,
      mimeType: att.mimeType,
    });
  }

  const storage = getStorage();

  let head: { size: number };
  try {
    head = await storage.head(id);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Not uploaded yet — row is kept so the client can retry the PUT and
      // call complete again. Abandoned rows are reaped by the sweeper.
      return fail(409, 'NOT_UPLOADED');
    }
    throw err;
  }

  if (head.size !== att.size) {
    await storage.delete(id).catch(() => {});
    await repo.remove(id).catch(() => {});
    return fail(400, 'SIZE_MISMATCH');
  }

  const { stream } = await storage.read(id, { start: 0, end: SNIFF_BYTES - 1 });
  const head4k = await readSniffBuffer(stream);
  const sniffed = sniffMime(head4k);
  if (!sniffed || sniffed !== att.mimeType) {
    await storage.delete(id).catch(() => {});
    await repo.remove(id).catch(() => {});
    return fail(415, 'MIME_MISMATCH');
  }

  await repo.markReady(id);

  return NextResponse.json({
    id: att.id,
    name: att.name,
    size: att.size,
    mimeType: att.mimeType,
  });
}
