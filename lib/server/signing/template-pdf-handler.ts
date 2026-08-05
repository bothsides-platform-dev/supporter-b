import { auth } from '@/auth';
import { isEmailUnverified, isSessionRevoked } from '@/lib/auth/session';
import { SIGNING_TEMPLATE_PDF_MAX_BYTES } from '@/lib/signing/template-limits';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';

/**
 * 계약서 템플릿 원본 PDF 스트리밍 프록시 — 세션·소유 검증 후 SnowSign 의 1시간
 * presigned URL 을 **서버가 fetch 해 바이트를 중계**한다. 계약 완료본(download-handler)
 * 의 302 와 다른 이유: 소비자가 탭 내비게이션이 아니라 에디터의 fetch 다(pdf.js 렌더
 * + 수정 저장 시 재업로드). 302 를 따라간 최종 응답은 S3 크로스오리진이라 그쪽 CORS
 * 설정(우리 통제 밖)에 종속된다. 로컬 보관 없음 — 통과 스트림뿐이다.
 *
 * 오류는 상태코드 + 짧은 텍스트로 답한다(소비자가 fetch 라 HTML 안내 페이지 불필요).
 */
export async function handleTemplatePdf(templateId: string): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  if (await isSessionRevoked(session)) return new Response('Unauthorized', { status: 401 });
  if (await isEmailUnverified(session)) return new Response('Forbidden', { status: 403 });

  const workspaceId = (session.user as { workspaceId?: string }).workspaceId;
  if (!workspaceId) return new Response('Forbidden', { status: 403 });
  if (!templateId) return new Response('Bad Request', { status: 400 });

  const service = await getSigningTemplateService();
  const r = await service.getDocumentDownloadUrl(
    { userId: session.user.id, workspaceId },
    templateId,
  );
  if (!r.ok) {
    const status = r.error === 'FORBIDDEN' ? 403 : r.error === 'TEMPLATE_NOT_FOUND' ? 404 : 502;
    return new Response('Template document unavailable', { status });
  }

  let upstream: Response;
  try {
    upstream = await fetch(r.url);
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }
  if (!upstream.ok) return new Response('Bad Gateway', { status: 502 });

  // 방어적 상한 — 우리가 올린 파일은 이미 50MB 캡 아래지만, provider 응답을
  // 무조건 중계하지 않는다(선언 크기가 캡을 넘으면 끊는다).
  const declared = Number(upstream.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > SIGNING_TEMPLATE_PDF_MAX_BYTES) {
    return new Response('Bad Gateway', { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      ...(upstream.headers.get('Content-Length')
        ? { 'Content-Length': upstream.headers.get('Content-Length')! }
        : {}),
    },
  });
}
