import { auth } from '@/auth';
import { isEmailUnverified, isSessionRevoked } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { SIGNING_TEMPLATE_PDF_MAX_BYTES } from '@/lib/signing/template-limits';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';

// 다른 아웃바운드 홉(SnowSignClient 15초)과 같은 규율 — 데드라인 없는 fetch 는
// 굳은 S3 연결이 PM2 단일 포크의 태스크를 영영 붙든다.
const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * 실제 흘러간 바이트를 세어 상한을 스트림 자체에 강제한다 — 선언 Content-Length
 * 만 믿으면 헤더를 생략한(chunked) 응답이 캡을 통째로 우회한다. 상한 초과 시
 * 스트림을 error 시켜 소비자(에디터 fetch)가 reject 로 받게 한다(헤더는 이미
 * 나간 뒤라 상태코드로는 표현할 수 없다).
 */
export function cappedPdfStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          controller.error(new Error('template pdf exceeds size cap'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * 계약서 템플릿 원본 PDF 스트리밍 프록시 — 세션·PG 승인·소유 검증 후 SnowSign 의
 * 1시간 presigned URL 을 **서버가 fetch 해 바이트를 중계**한다. 계약 완료본
 * (download-handler)의 302 와 다른 이유: 소비자가 탭 내비게이션이 아니라 에디터의
 * fetch 다(pdf.js 렌더 + 수정 저장 시 재업로드). 302 를 따라간 최종 응답은 S3
 * 크로스오리진이라 그쪽 CORS 설정(우리 통제 밖)에 종속된다. 로컬 보관 없음 —
 * 통과 스트림뿐이다.
 *
 * 오류는 상태코드 + 짧은 텍스트로 답한다(소비자가 fetch 라 HTML 안내 페이지 불필요).
 */
export async function handleTemplatePdf(templateId: string): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  if (await isSessionRevoked(session)) return new Response('Unauthorized', { status: 401 });
  if (await isEmailUnverified(session)) return new Response('Forbidden', { status: 403 });
  // PG 승인 서버 데이터 경계(v0.4.20.0) — pending_approval/rejected 멤버는 JWT 가
  // 멀쩡해도 PG 전용 데이터에 닿으면 안 된다. /api 는 프록시 매처 밖이라 이
  // 인라인 게이트가 유일한 게이트다(마스터 면제는 isPgMembershipBlocked 내부).
  if (await isPgMembershipBlocked(session)) return new Response('Forbidden', { status: 403 });

  const workspaceId = (session.user as { workspaceId?: string }).workspaceId;
  if (!workspaceId) return new Response('Forbidden', { status: 403 });
  if (!templateId) return new Response('Bad Request', { status: 400 });

  const service = await getSigningTemplateService();
  const r = await service.getDocumentDownloadUrl(
    { userId: session.user.id, workspaceId },
    templateId,
  );
  if (!r.ok) {
    // 소유권 오라클 접기 — 403(남의 것)/404(없음)를 가르면 인증 사용자가 임의
    // id 의 존재를 판별할 수 있다(getForActor ACL-먼저 독트린). 서비스 코드는
    // 구분을 유지하되 HTTP 경계에서는 둘 다 404 로 접는다.
    const status =
      r.error === 'FORBIDDEN' || r.error === 'TEMPLATE_NOT_FOUND'
        ? 404
        : r.error === 'SNOWSIGN_RATE_LIMIT'
          ? 429
          : 502;
    return new Response('Template document unavailable', { status });
  }

  let upstream: Response;
  try {
    upstream = await fetch(r.url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new Response('Bad Gateway', { status: 502 });

  // 선언 크기가 캡을 넘으면 스트림을 시작하기 전에 끊는다(빠른 실패). 헤더가
  // 없거나 거짓이어도 아래 cappedPdfStream 이 실 바이트 기준으로 다시 지킨다.
  const declared = Number(upstream.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > SIGNING_TEMPLATE_PDF_MAX_BYTES) {
    return new Response('Bad Gateway', { status: 502 });
  }

  // Content-Length 는 중계하지 않는다 — undici 가 Content-Encoding 을 풀어낸
  // 본문과 원 헤더가 어긋날 수 있어(압축 저장 객체) 런타임 프레이밍에 맡긴다.
  // 원본 파일명은 헤더로 실어 보낸다(한글이라 URI 인코딩) — 로컬 DB 에 파일명이
  // 없어, 이것이 없으면 에디터의 같은-PDF 재선택 보존(이름 대조)이 성립하지 않는다.
  return new Response(cappedPdfStream(upstream.body, SIGNING_TEMPLATE_PDF_MAX_BYTES), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      ...(r.filename ? { 'X-Template-Filename': encodeURIComponent(r.filename) } : {}),
    },
  });
}
