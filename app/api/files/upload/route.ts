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
 * Storage-then-DB ordering (advisor pin 6):
 *   1. Sniff + validate buffer.
 *   2. Compute key via `newAttachmentPath(filename)`.
 *   3. `storage.save(key, buffer, mime)`.
 *   4. `attachmentRepo.save({...})`.
 *   5. If step 4 throws — best-effort `storage.delete(key)`. The stored
 *      object is the orphan, not the row; deleting the storage entry
 *      first means the system can never claim a row whose payload is
 *      missing.
 *
 * Orphan rows from interrupted uploads are NOT cleaned up in v0. v1
 * cron sweeper deletes attachments older than 24h with no parent row.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import {
  getAttachmentRepo,
  getBidRepo,
  getInvitationRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { DRAFT_OWNER_ID } from '@/lib/server/storage/path';
import { sniffMime, type AcceptedMime } from '@/lib/server/storage/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIMES = new Set<AcceptedMime>([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

const MetaInput = z
  .object({
    ownerKind: z.enum(['rfp', 'bid_proposal', 'bid_note', 'chat', 'team_message']),
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

  // Per-ownerKind ACL on the upload itself.
  const userId = session.user.id;
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  const wsType = (session.user as { workspaceType?: 'buyer' | 'pg' })
    .workspaceType;

  if (meta.data.ownerKind === 'rfp') {
    // Buyer-only upload path. Draft window: ownerId may be a placeholder
    // (literal '__draft__') because the RFP is still being authored.
    if (wsType !== 'buyer' || !wsId) return fail(403, 'FORBIDDEN');
    if (meta.data.ownerId !== DRAFT_OWNER_ID) {
      const rfp = await (await getRfpRepo()).findById(meta.data.ownerId);
      if (!rfp) return fail(404, 'RFP_NOT_FOUND');
      if (rfp.buyerWsId !== wsId) return fail(403, 'FORBIDDEN');
    }
  } else if (meta.data.ownerKind === 'chat') {
    // Chat attachment — buyer↔PG IM. Any authenticated workspace member may
    // upload an ownerless draft; sendChatMessageAction links it to the
    // chat_messages row and re-checks the uploader is a session-ws member.
    // ownerId is the literal '__draft__' placeholder (no parent yet).
    if (!wsId) return fail(403, 'FORBIDDEN');
    if (!(await (await getWorkspaceRepo()).isMember(userId, wsId))) {
      return fail(403, 'FORBIDDEN');
    }
  } else if (meta.data.ownerKind === 'bid_note') {
    // Buyer-only memo attachment. ownerId here is the *bid id* (the parent
    // bid_notes row may not exist yet — the action layer creates it and
    // re-points owner_id to the new bid_notes.id after this row lands).
    // Gate: user must be a member of the buyer ws that owns the RFP behind
    // this bid.
    if (wsType !== 'buyer' || !wsId) return fail(403, 'FORBIDDEN');
    const row = await (await getBidRepo()).findRfpOwner(meta.data.ownerId);
    if (!row) return fail(404, 'BID_NOT_FOUND');
    if (row.buyerWsId !== wsId) return fail(403, 'FORBIDDEN');
    // Workspace membership — match the post-cutover bid_note ACL in
    // storage/permissions.ts so the upload and the read share one matrix.
    if (!(await (await getWorkspaceRepo()).isMember(userId, wsId))) {
      return fail(403, 'FORBIDDEN');
    }
  } else if (meta.data.ownerKind === 'team_message') {
    // Team-thread attachment — buyer (owns the RFP) or invited PG. ownerId is
    // the *RFP id* (the parent rfp_team_messages row may not exist yet —
    // sendTeamMessageAction creates it and re-points owner_id after this row
    // lands). Gate mirrors TeamChatService.authorize.
    if (!wsId) return fail(403, 'FORBIDDEN');
    if (wsType === 'buyer') {
      const rfp = await (await getRfpRepo()).findById(meta.data.ownerId);
      if (!rfp) return fail(404, 'RFP_NOT_FOUND');
      if (rfp.buyerWsId !== wsId) return fail(403, 'FORBIDDEN');
      // Membership — match the team-message read ACL in storage/permissions.ts.
      if (!(await (await getWorkspaceRepo()).isMember(userId, wsId))) {
        return fail(403, 'FORBIDDEN');
      }
    } else {
      // PG — invitation gate (same as loadPgRfpDetail / bid_proposal).
      const invRepo = await getInvitationRepo();
      if (!(await invRepo.canAccess(meta.data.ownerId, wsId))) {
        return fail(403, 'FORBIDDEN');
      }
    }
  } else {
    // bid_proposal — PG-only, must be a member of an invited PG ws for ownerId.
    if (wsType !== 'pg' || !wsId) return fail(403, 'FORBIDDEN');
    const invRepo = await getInvitationRepo();
    const ok = await invRepo.canAccess(meta.data.ownerId, wsId);
    if (!ok) return fail(403, 'FORBIDDEN');
  }

  // DB metadata first, blob second — attachment_blobs.attachment_id FKs the
  // attachments row (C4), so the metadata must exist before the bytes. The
  // storage key is the attachment id.
  const id = randomUUID();
  const repo = await getAttachmentRepo();

  // Owner link at upload: only the 'rfp' non-draft path links immediately.
  // bid_proposal/bid_note (and the rfp draft window) start ownerless and are
  // linked by their action (createRfp / submitBid / addBidNote).
  const rfpLink =
    meta.data.ownerKind === 'rfp' && meta.data.ownerId !== DRAFT_OWNER_ID
      ? { rfpId: meta.data.ownerId }
      : {};

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
