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
 *      the `status === 'ready'` fast-path above). If the pending row vanished
 *      after byte verification, return `409 UPLOAD_CONFLICT` so the client can
 *      restart instead of reporting a false success.
 *
 * Auth: only the uploader may complete their own upload (`att.uploadedBy
 * !== session.user.id` -> 403). Same 3-layer session gate as the other
 * file routes.
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getStorage } from '@/lib/server/storage';
import { createPresignedUploadModule } from '@/lib/server/presigned-upload/module';
import { createAttachmentUploadAdapter } from '@/lib/server/presigned-upload/attachment-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

function unexpectedCompleteRejection(reason: never): Response {
  void reason;
  return fail(500, 'COMPLETE_FAILED');
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

  const uploads = createPresignedUploadModule({
    adapter: createAttachmentUploadAdapter(),
    storage: getStorage(),
  });
  const result = await uploads.complete({ userId: session.user.id }, id);
  if (!result.ok) {
    if (result.reason === 'not-found') return fail(404, 'NOT_FOUND');
    if (result.reason === 'forbidden') return fail(403, 'FORBIDDEN');
    if (result.reason === 'not-uploaded') return fail(409, 'NOT_UPLOADED');
    if (result.reason === 'size-mismatch') return fail(400, 'SIZE_MISMATCH');
    if (result.reason === 'mime-mismatch') return fail(415, 'MIME_MISMATCH');
    if (result.reason === 'conflict') return fail(409, 'UPLOAD_CONFLICT');
    return unexpectedCompleteRejection(result.reason);
  }
  return NextResponse.json(result.value);
}
