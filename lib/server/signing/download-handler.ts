import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isEmailUnverified, isSessionRevoked } from '@/lib/auth/session';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { popupErrorPage } from '@/lib/server/http/popup-error-page';
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
    // 팝업 탭에 raw 코드가 아니라 친절한 한글 안내를 보여준다(U2).
    return signingErrorPage(signingErrorMessage(r.error, '완료본을 불러오지 못했어요'), status);
  }

  // SnowSign 이 2xx 로 준 URL 이 비정상(빈/상대경로 등)이면 NextResponse.redirect 의
  // new URL() 이 throw 한다 — 500 대신 502 로 우아하게 처리한다(A3, 클라 검증의 2차 방어).
  try {
    const res = NextResponse.redirect(r.url, 302);
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  } catch {
    return signingErrorPage(
      signingErrorMessage('SNOWSIGN_MALFORMED', '완료본을 불러오지 못했어요'),
      502,
    );
  }
}

// 다운로드 팝업 탭용 최소 한글 오류 페이지(완료본은 on-demand 프록시라 로컬 보관 없음).
// 계약 보관함 다운로드와 **같은 구현**을 쓴다 — 둘 다 `target="_blank"` 로 열려
// 실패 응답이 팝업에 그대로 보이는 같은 문제를 푼다.
function signingErrorPage(message: string, status: number): Response {
  return popupErrorPage(message, status, '전자서명');
}
