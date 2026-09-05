/**
 * POST /api/contract-archives/{id}/complete — 계약 보관함 수동 업로드 2단계.
 *
 * 검증·보상·ready 전이는 `lib/server/presigned-upload/module.ts`가 소유한다.
 * 클라이언트가 `POST /api/contract-archives/presign` 이 발급한
 * presigned URL 로 직접 PUT 한 뒤 이 라우트를 호출하면, 서버가 객체를
 * 독립적으로 재검증(클라이언트 자기신고를 신뢰하지 않음)하고 행을
 * `status: 'pending'` → `'ready'` 로 전이한다.
 *
 * 검증 순서(각 실패는 그 호출의 종결):
 *   1. 행 존재 / `source==='upload'` / 소유(`createdBy`) — 라우트 소관이
 *      아닌 signing 출처 행과 남의 업로드 모두 404(존재 오라클 회피).
 *   2. 이미 `ready` 면 스토리지 재검증 없이 200 멱등.
 *   3. `storage.head(documentKey)` — ENOENT 면 PUT 이 아직 안 붙은 것.
 *      행은 유지(재시도 가능) — 방치된 pending 은 `deleteStaleUploadPending`
 *      스윕이 청소한다.
 *   4. 크기 검사 — `head.size !== row.documentSize`. 방어적 레이어일 뿐
 *      (presigned 서명에 이미 Content-Length 가 포함) — 종결: 객체+행 삭제.
 *   5. 매직바이트 스니핑(첫 4KB) — PDF 가 아니면 종결: 객체+행 삭제.
 *   6. `markUploadReady(id)` — pending 행만 ready 로 전이(멱등 안전망은
 *      2번의 fast-path). 바이트 검증 뒤 pending 행이 사라진 경합은
 *      `409 UPLOAD_CONFLICT` 로 반환해 거짓 성공을 막는다.
 *
 * Auth: 3-layer 세션 게이트(auth / isSessionRevoked / isEmailUnverified) +
 * PG 멤버십 승인 게이트(신규 /api 라우트 인라인 배선 규칙) — 다른
 * contract-archives 라우트와 동일.
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { getStorage } from '@/lib/server/storage';
import { createPresignedUploadModule } from '@/lib/server/presigned-upload/module';
import { createArchiveUploadAdapter } from '@/lib/server/presigned-upload/archive-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

function unexpectedCompleteRejection(reason: never): Response {
  void reason;
  return fail(500, 'COMPLETE_FAILED');
}

export async function POST(
  _req: Request,
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

  const { id } = await ctx.params;
  if (!id) return fail(404, 'NOT_FOUND');
  const uploads = createPresignedUploadModule({
    adapter: createArchiveUploadAdapter(),
    storage: getStorage(),
  });
  const result = await uploads.complete({ userId: session.user.id }, id);
  if (!result.ok) {
    if (result.reason === 'not-found') return fail(404, 'NOT_FOUND');
    if (result.reason === 'invalid-state') return fail(500, 'INVALID_STATE');
    if (result.reason === 'not-uploaded') return fail(409, 'NOT_UPLOADED');
    if (result.reason === 'size-mismatch') return fail(400, 'SIZE_MISMATCH');
    if (result.reason === 'mime-mismatch') return fail(415, 'MIME_MISMATCH');
    if (result.reason === 'conflict') return fail(409, 'UPLOAD_CONFLICT');
    return unexpectedCompleteRejection(result.reason);
  }
  return NextResponse.json(result.value);
}
