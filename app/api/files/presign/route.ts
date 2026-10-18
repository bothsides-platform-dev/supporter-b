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
 * Auth: the route owns the common business session gate; the attachment adapter owns
 * the per-owner ACL and pending-row mapping.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/auth';
import { checkBusinessApiSession } from '@/lib/server/http/business-api-session';
import { getStorage } from '@/lib/server/storage';
import { MAX_BYTES } from '@/lib/server/storage/constants';
import { createPresignedUploadModule } from '@/lib/server/presigned-upload/module';
import {
  ATTACHMENT_ACCEPTED_MIME,
  ATTACHMENT_OWNER_KINDS,
  createAttachmentUploadAdapter,
} from '@/lib/server/presigned-upload/attachment-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AcceptedMimeEnum = z.enum(ATTACHMENT_ACCEPTED_MIME);

const PresignInput = z
  .object({
    ownerKind: z.enum(ATTACHMENT_OWNER_KINDS),
    ownerId: z.string().min(1).max(64),
    name: z.string().min(1).max(255),
    size: z.number().int().min(1).max(MAX_BYTES),
    mime: AcceptedMimeEnum,
  })
  .strict();

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

function unexpectedBeginRejection(reason: never): Response {
  void reason;
  return fail(500, 'PRESIGN_FAILED');
}

export async function POST(req: Request): Promise<Response> {
  const access = await checkBusinessApiSession(await auth());
  if (!access.ok) return fail(access.status, access.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  const { session } = access;

  const expectedUser = req.headers.get('x-draft-user');
  const expectedWorkspace = req.headers.get('x-draft-workspace');
  if ((expectedUser && expectedUser !== session.user.id) || (expectedWorkspace && expectedWorkspace !== session.user.workspaceId)) return fail(409, 'WORKSPACE_CHANGED');

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

  const uploads = createPresignedUploadModule({
    adapter: createAttachmentUploadAdapter(),
    storage: getStorage(),
  });
  const result = await uploads.begin(
    { userId, workspaceId: wsId, workspaceType: wsType },
    input,
  );
  if (!result.ok) {
    if (result.reason === 'upload-limit') return fail(429, 'UPLOAD_LIMIT');
    if (result.reason === 'presign-failed') return fail(500, 'PRESIGN_FAILED');
    if (result.reason === 'file-too-large') return fail(413, 'FILE_TOO_LARGE');
    if (result.reason === 'mime-not-allowed') return fail(400, 'INVALID_INPUT');
    if (result.reason === 'rfp-not-found') return fail(404, 'RFP_NOT_FOUND');
    if (result.reason === 'bid-not-found') return fail(404, 'BID_NOT_FOUND');
    if (result.reason === 'forbidden') return fail(403, 'FORBIDDEN');
    return unexpectedBeginRejection(result.reason);
  }
  return NextResponse.json({ id: result.id, uploadUrl: result.uploadUrl });
}
