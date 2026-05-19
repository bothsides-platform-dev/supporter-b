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
 * Disk-then-DB ordering (advisor pin 6):
 *   1. Sniff + validate buffer.
 *   2. Compute key via `newAttachmentPath(filename)`.
 *   3. `storage.save(key, buffer, mime)`.
 *   4. `attachmentRepo.save({...})`.
 *   5. If step 4 throws — best-effort `storage.delete(key)`. The disk
 *      file is the orphan, not the row; deleting the disk first means
 *      the system can never claim a row whose payload is missing.
 *
 * Orphan rows from interrupted uploads are NOT cleaned up in v0. v1
 * cron sweeper deletes attachments older than 24h with no parent row.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { bids, rfps, workspaceMembers } from '@/lib/db/schema';
import { db as prodDb } from '@/lib/db/client';
import {
  getAttachmentRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { DRAFT_OWNER_ID, newAttachmentPath } from '@/lib/server/storage/path';
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
    ownerKind: z.enum(['rfp', 'bid_proposal', 'bid_note']),
    ownerId: z.string().min(1).max(64),
  })
  .strict();

declare global {
   
  var __bidit_files_db_override__: unknown | undefined;
}

// Test-only override (matches the action-layer pattern). Tests install a
// pglite db handle so the file route can read/write without the prod
// postgres-js client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routeDb(): any {
  return globalThis.__bidit_files_db_override__ ?? prodDb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setFilesDbForTest(db: any | undefined): void {
  globalThis.__bidit_files_db_override__ = db;
}

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

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
      const [rfp] = await routeDb()
        .select({ buyerWsId: rfps.buyerWsId })
        .from(rfps)
        .where(eq(rfps.id, meta.data.ownerId))
        .limit(1);
      if (!rfp) return fail(404, 'RFP_NOT_FOUND');
      if (rfp.buyerWsId !== wsId) return fail(403, 'FORBIDDEN');
    }
  } else if (meta.data.ownerKind === 'bid_note') {
    // Buyer-only memo attachment. ownerId here is the *bid id* (the parent
    // bid_notes row may not exist yet — the action layer creates it and
    // re-points owner_id to the new bid_notes.id after this row lands).
    // Gate: user must be a member of the buyer ws that owns the RFP behind
    // this bid.
    if (wsType !== 'buyer' || !wsId) return fail(403, 'FORBIDDEN');
    const [row] = await routeDb()
      .select({ buyerWsId: rfps.buyerWsId })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .where(eq(bids.id, meta.data.ownerId))
      .limit(1);
    if (!row) return fail(404, 'BID_NOT_FOUND');
    if (row.buyerWsId !== wsId) return fail(403, 'FORBIDDEN');
    // Workspace membership — match the post-cutover bid_note ACL in
    // storage/permissions.ts so the upload and the read share one matrix.
    const [member] = await routeDb()
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, wsId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!member) return fail(403, 'FORBIDDEN');
  } else {
    // bid_proposal — PG-only, must be a member of an invited PG ws for ownerId.
    if (wsType !== 'pg' || !wsId) return fail(403, 'FORBIDDEN');
    const invRepo = await getInvitationRepo();
    const ok = await invRepo.canAccess(meta.data.ownerId, wsId);
    if (!ok) return fail(403, 'FORBIDDEN');
  }

  // Disk first, DB second — see header note.
  const key = newAttachmentPath(file.name);
  const storage = getStorage();
  await storage.save(key, buffer, sniffed);

  try {
    const id = randomUUID();
    const repo = await getAttachmentRepo();
    await repo.save({
      id,
      ownerKind: meta.data.ownerKind,
      ownerId: meta.data.ownerId,
      name: file.name,
      size: file.size,
      mimeType: sniffed,
      storagePath: key,
      uploadedBy: userId,
      url: '', // url is route-resolved (`/api/files/{id}`) on the client.
    });
    return NextResponse.json({
      id,
      name: file.name,
      size: file.size,
      mimeType: sniffed,
    });
  } catch (err) {
    // Best-effort cleanup so the disk file doesn't outlive the failed row.
    await storage.delete(key).catch(() => {});
    throw err;
  }
}
