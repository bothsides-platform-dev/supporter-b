import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isEmailUnverified, isSessionRevoked } from '@/lib/auth/session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';

/**
 * 완료본/감사추적인증서 온디맨드 프록시 — 세션·ACL·completed 검증 후 SnowSign 이
 * 발급한 1시간 URL 로 302 리다이렉트한다. 로컬 보관 없음(SnowSign 위임).
 * ACL 은 서비스(양측: buyer ws OR 낙찰 PG ws)에서 재검증한다.
 */
export async function handleSigningDownload(
  contractId: string,
  kind: 'document' | 'audit',
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  if (await isSessionRevoked(session)) return new Response('Unauthorized', { status: 401 });
  if (await isEmailUnverified(session)) return new Response('Forbidden', { status: 403 });

  const workspaceId = (session.user as { workspaceId?: string }).workspaceId;
  if (!workspaceId) return new Response('Forbidden', { status: 403 });
  if (!contractId) return new Response('Bad Request', { status: 400 });

  const service = await getContractSigningService();
  const r = await service.getDownloadUrl(contractId, kind, {
    userId: session.user.id,
    workspaceId,
  });
  if (!r.ok) {
    const status =
      r.error === 'FORBIDDEN'
        ? 403
        : r.error === 'CONTRACT_NOT_FOUND'
          ? 404
          : r.error === 'NOT_COMPLETED'
            ? 409
            : 502;
    return new Response(r.error, { status });
  }

  const res = NextResponse.redirect(r.url, 302);
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
