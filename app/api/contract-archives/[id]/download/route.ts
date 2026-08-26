/**
 * GET /api/contract-archives/{id}/download?doc=document|audit — 보관 문서 다운로드.
 *
 * `app/api/files/[id]/route.ts` 의 미러다: ACL 을 매 요청 재검증하고 **302 로
 * presigned R2 GET 에 넘긴다.** 바이트를 우리 서버로 흘리지 않으므로 큰 PDF 가
 * fork 를 붙들지 않는다.
 *
 * 딜룸의 완료본 프록시(`/api/signing/{id}/document`)와는 목적지가 다르다 — 그쪽은
 * 공급자가 발급한 1시간 URL 로 넘기고 우리는 사본을 갖지 않는다. 여기는 **우리
 * R2 사본**이라 공급자와의 관계가 끝나도 살아 있다(보관함의 존재 이유).
 *
 * ACL 의 SSOT 는 **행 소유 워크스페이스** 하나이며 판정은 서비스가 소유한다
 * (`getDownloadUrl`). 남의 행에는 403 이 아니라 404 를 낸다 — 상태 코드가 존재
 * 오라클이 되지 않게.
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { getContractArchiveService } from '@/lib/server/services/contract-archive';
import { popupErrorPage } from '@/lib/server/http/popup-error-page';
import { contractArchiveErrorMessage } from '@/lib/contract-archive/error-messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOC_KINDS = ['document', 'audit'] as const;
type DocKind = (typeof DOC_KINDS)[number];

function isDocKind(v: string): v is DocKind {
  return (DOC_KINDS as readonly string[]).includes(v);
}

/**
 * 이 라우트는 `target="_blank"` 로 열린다 — 실패 응답이 팝업 탭에 **그대로 보인다**.
 * JSON 을 돌려주면 사용자는 `{"ok":false,"error":"ARCHIVE_NOT_READY"}` 를 읽게 되고,
 * 그 탭에는 앱 셸이 없어 토스트로 옮겨 줄 수도 없다. 완료본 프록시와 같은 처리다.
 */
function fail(status: number, error: string): Response {
  return popupErrorPage(
    contractArchiveErrorMessage(error, '계약서를 불러오지 못했어요'),
    status,
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');
  // 폐기된 세션(sv stale) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  // 이메일 미인증 세션 거부 — 서버 경계 강제 (C4).
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');
  // PG 멤버십 승인 게이트 — 신규 /api 라우트 인라인 배선 규칙.
  if (await isPgMembershipBlocked(session)) return fail(403, 'FORBIDDEN');

  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  if (!wsId) return fail(403, 'FORBIDDEN');

  // 생략은 완료본으로 본다(가장 흔한 요청). 다만 **알 수 없는 값은 400** 이다 —
  // 조용히 완료본으로 떨어뜨리면 `doc=audit` 오타가 인증서인 척하는 완료본을 준다.
  const raw = new URL(req.url).searchParams.get('doc');
  if (raw !== null && !isDocKind(raw)) return fail(400, 'INVALID_DOC');
  const doc: DocKind = raw ?? 'document';

  const { id } = await ctx.params;
  // uuid 형태 검증 — `contract_archives.id` 는 uuid 컬럼이라, 비-uuid 를 그대로
  // 넘기면 Postgres 가 22P02 를 던지고 아무도 잡지 않아 **처리 안 된 500** 이 된다.
  // 404 로 맞춰 상태 코드가 존재 오라클이 되지 않게 한다(아래 ACL 분기와 같은 값).
  if (!UUID_RE.test(id)) return fail(404, 'NOT_FOUND');
  const r = await (await getContractArchiveService()).getDownloadUrl(id, doc, {
    userId: session.user.id,
    workspaceId: wsId,
  });
  if (!r.ok) {
    // NOT_FOUND·ARCHIVE_DOC_NOT_FOUND 는 404, 아직 준비 안 된 행은 409.
    const status = r.error === 'ARCHIVE_NOT_READY' ? 409 : 404;
    return fail(status, r.error);
  }

  // 302 자체는 캐시 금지 — ACL 은 매 요청 재검증돼야 한다.
  return NextResponse.redirect(r.url, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
