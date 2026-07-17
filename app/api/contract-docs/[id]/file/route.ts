/**
 * GET /api/contract-docs/{id}/file — authenticated download of a contract
 * doc's PDF, redirecting to a presigned R2 URL. Mirrors
 * `app/api/files/[id]/route.ts`'s 3-gate + presigned-redirect shape; the ACL
 * here is simpler (exactly two workspaces may ever read a contract doc) so it
 * doesn't need the generic `canAccessAttachment` matrix.
 *
 * Auth: same 3-layer gate as files/[id] (auth / isSessionRevoked /
 * isEmailUnverified).
 *
 * ACL: the session's active workspace must be either `doc.buyerWsId` or
 * `doc.pgWsId`. 401/403/404 mirror files/[id]'s contract.
 *
 * Key selection: a completed doc (status==='completed' with a finalPdfKey)
 * serves the final (fully-signed + audit-sheet) PDF; every other status
 * serves the base (unsigned template composition) PDF. The completed
 * filename is suffixed "-완료본" so a browser download is self-explanatory.
 *
 * `?download=1` requests `Content-Disposition: attachment` (explicit save);
 * otherwise the URL signs `inline` (in-app PDF viewer).
 *
 * TTL: 900s, `Cache-Control: private, no-store` on the 302 itself (ACL must
 * be re-checked on every call — ownership state changes at every event).
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getContractDocRepo } from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRESIGN_GET_TTL_SECONDS = 900;

function fail(status: number, msg: string): Response {
  return new Response(msg, { status });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'Unauthorized');

  // 폐기된 세션(sv stale) 거부 — requireSession 과 동일 기준.
  if (await isSessionRevoked(session)) return fail(401, 'Unauthorized');
  // 이메일 미인증 세션 거부 — 서버 경계 강제.
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  const { id } = await ctx.params;
  if (!id) return fail(400, 'Bad Request');

  const doc = await (await getContractDocRepo()).findById(id);
  if (!doc) return fail(404, 'Not Found');

  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  if (!wsId || (wsId !== doc.buyerWsId && wsId !== doc.pgWsId)) {
    return fail(403, 'Forbidden');
  }

  const completed = doc.status === 'completed' && !!doc.finalPdfKey;
  const key = completed ? doc.finalPdfKey! : doc.basePdfKey;
  const filename = `${doc.code}${completed ? '-완료본' : ''}.pdf`;

  const { searchParams } = new URL(req.url);
  const disposition = searchParams.get('download') === '1' ? 'attachment' : 'inline';

  const url = await getStorage().presignGet(key, {
    filename,
    mime: 'application/pdf',
    expiresInSeconds: PRESIGN_GET_TTL_SECONDS,
    disposition,
  });

  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
