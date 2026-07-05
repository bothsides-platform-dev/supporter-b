/**
 * POST /api/files/presign — phase 1 of the two-phase presigned upload.
 *
 * Flow: client calls this route with the file's declared metadata →
 * server creates a `status: 'pending'` attachment row (id = the storage
 * key) and mints a time-limited presigned PUT URL → client PUTs the raw
 * bytes directly to R2 (bypassing the app) → client calls
 * `POST /api/files/{id}/complete` (phase 2) to verify the object landed
 * and flip the row to `status: 'ready'`.
 *
 * A `pending` row is invisible everywhere else: every exposed read path
 * (`findByRfp`, `findByChatMessageIds`, `findByConversationId`, `claim`,
 * `findUnclaimedByIds`) filters `status = 'ready'`, and the download route
 * (`app/api/files/[id]/route.ts`) 404s on a pending row. It also can't be
 * `claim()`-ed by an action until it's ready. If the client never
 * completes the upload (crash, abandoned tab, ...) the row is inert and
 * reclaimed by the sweeper (`attachmentRepo.deleteStalePending`, 1h
 * cutoff) — no route in this file needs to know about that job.
 *
 * Auth: same 3-layer gate as `upload/route.ts` (auth / isSessionRevoked /
 * isEmailUnverified) + the shared `authorizeAttachmentUpload` ACL.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getAttachmentRepo } from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { MAX_BYTES } from '@/lib/server/storage/constants';
import { authorizeAttachmentUpload, OWNER_KINDS } from '../_upload-acl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRESIGN_PUT_TTL_SECONDS = 600;

const AcceptedMimeEnum = z.enum([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

const PresignInput = z
  .object({
    ownerKind: z.enum(OWNER_KINDS),
    ownerId: z.string().min(1).max(64),
    name: z.string().min(1).max(255),
    size: z.number().int().min(1).max(MAX_BYTES),
    mime: AcceptedMimeEnum,
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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail(400, 'INVALID_JSON');
  }

  const parsed = PresignInput.safeParse(json);
  if (!parsed.success) {
    // Size out-of-range collapses into 400 by default from zod, but a
    // too-large size gets its own status (413) per the upload route's
    // convention — check that specific case before the generic 400.
    const tooLarge = parsed.error.issues.some(
      (i) => i.path[0] === 'size' && typeof json === 'object' && json !== null &&
        typeof (json as { size?: unknown }).size === 'number' &&
        (json as { size: number }).size > MAX_BYTES,
    );
    if (tooLarge) return fail(413, 'FILE_TOO_LARGE');
    return fail(400, 'INVALID_INPUT');
  }
  const input = parsed.data;

  const userId = session.user.id;
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  const wsType = (session.user as { workspaceType?: 'buyer' | 'pg' })
    .workspaceType;

  const authz = await authorizeAttachmentUpload(
    { userId, workspaceId: wsId, workspaceType: wsType },
    { ownerKind: input.ownerKind, ownerId: input.ownerId },
  );
  if (!authz.ok) return fail(authz.status, authz.error);

  const id = randomUUID();
  const repo = await getAttachmentRepo();

  await repo.save({
    id,
    name: input.name,
    size: input.size,
    mimeType: input.mime,
    uploadedBy: userId,
    url: '', // url is route-resolved (`/api/files/{id}`) on the client.
    status: 'pending',
    ...authz.rfpLink,
  });

  try {
    const uploadUrl = await getStorage().presignPut(id, {
      mime: input.mime,
      size: input.size,
      expiresInSeconds: PRESIGN_PUT_TTL_SECONDS,
    });
    return NextResponse.json({ id, uploadUrl });
  } catch {
    // Presign mint failed — drop the orphan pending row (best-effort).
    await repo.remove(id).catch(() => {});
    return fail(500, 'PRESIGN_FAILED');
  }
}
