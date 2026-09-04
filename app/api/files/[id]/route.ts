/**
 * GET /api/files/{id} — authenticated download, redirects to a presigned
 * R2 URL (Stage 3 of the R2 attachment storage migration).
 *
 * Auth: `auth()` required. 401 if no session.
 *
 * ACL: delegated to `canAccessAttachment` (storage/permissions.ts) so the
 * same matrix applies to every read site (preview iframe, download link,
 * future inbox export). Result codes:
 *   - 401 unauthenticated
 *   - 403 authenticated but not allowed
 *   - 404 row not found, OR row exists but `status === 'pending'` (a
 *     not-yet-verified upload is invisible everywhere — same treatment as
 *     "doesn't exist" so its existence isn't leaked before `complete`
 *     confirms the bytes actually landed).
 *   - 302 redirect to a time-limited presigned GET URL (`Storage.presignGet`)
 *
 * Trade-off vs. the pre-Stage-3 app-proxy route: bytes are no longer
 * streamed through this app, so Range/ETag/If-None-Match/206/304/416 are
 * gone — the browser talks to R2 directly with the presigned URL. The old
 * "410 Gone when the row exists but the object is missing" contract is
 * also gone: `presignGet` is a purely local signature computation (it
 * can't know whether the object actually exists), so a dangling row now
 * redirects to a URL that R2 will answer with its own NoSuchKey XML error
 * instead of a clean app-level 410. This is an accepted trade-off — orphan
 * rows are rare (only from a failed post-insert step) and the sweeper
 * (`attachmentRepo.deleteStalePending`) only targets pending rows, not
 * ready rows with a missing object.
 *
 * TTL: the presigned URL expires in 15 minutes (`expiresInSeconds: 900`).
 * A client hitting an expired URL re-calls this route to get a fresh one
 * — there's no long-lived caching of the redirect (`Cache-Control:
 * private, no-store` on the 302 itself; ACL must be re-checked on every
 * call, so the redirect response itself is never cached).
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getAttachmentRepo } from '@/lib/server/repositories/factory';
import {
  canAccessAttachment,
  type RepoBundleForAttachment,
} from '@/lib/server/storage/permissions';
import { getStorage } from '@/lib/server/storage';
import { logger } from '@/lib/observability/logger';
import {
  getBidNoteRepo,
  getBidRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getInvitationRepo,
  getRfpRepo,
  getRfpTeamMessageRepo,
} from '@/lib/server/repositories/factory';

export const runtime = 'nodejs';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const dynamic = 'force-dynamic';

const PRESIGN_GET_TTL_SECONDS = 900;

function fail(status: number, msg: string): Response {
  return new Response(msg, { status });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'Unauthorized');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'Unauthorized');
  // 이메일 미인증 세션 거부 — 서버 경계 강제 (C4).
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  const { id } = await ctx.params;
  if (!id) return fail(400, 'Bad Request');

  const repo = await getAttachmentRepo();
  const att = await repo.findById(id);
  if (!att) return fail(404, 'Not Found');
  // Pending (not-yet-verified) uploads are invisible everywhere — same
  // "doesn't exist" treatment as a missing row.
  if (att.status === 'pending') return fail(404, 'Not Found');

  const repos: RepoBundleForAttachment = {
    invitation: await getInvitationRepo(),
    rfp: await getRfpRepo(),
    bid: await getBidRepo(),
    bidNote: await getBidNoteRepo(),
    chatMessage: await getChatMessageRepo(),
    chatConversation: await getChatConversationRepo(),
    rfpTeamMessage: await getRfpTeamMessageRepo(),
  };

  const allowed = await canAccessAttachment(
    att,
    {
      user: {
        id: session.user.id,
        workspaceId: (session.user as { workspaceId?: string }).workspaceId,
        workspaceType: (
          session.user as { workspaceType?: 'buyer' | 'pg' }
        ).workspaceType,
      },
    },
    repos,
  );
  if (!allowed) return fail(403, 'Forbidden');

  const url = await getStorage().presignGet(att.id, {
    filename: att.name,
    mime: att.mimeType,
    expiresInSeconds: PRESIGN_GET_TTL_SECONDS,
  });

  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'Unauthorized');
  if (await isSessionRevoked(session)) return fail(401, 'Unauthorized');
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  const { id } = await ctx.params;
  if (!id) return fail(400, 'Bad Request');
  if (!UUID_RE.test(id)) return new Response(null, { status: 204 });

  const repo = await getAttachmentRepo();
  const removed = await repo.removeReadyUnclaimedByUploader(id, session.user.id);
  if (removed) {
    try {
      await getStorage().delete(id);
    } catch (error) {
      logger.warn('attachment.storage_delete_failed', {
        attachmentId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return new Response(null, { status: 204 });
}
