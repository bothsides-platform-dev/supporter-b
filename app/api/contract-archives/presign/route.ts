/**
 * POST /api/contract-archives/presign — 계약 보관함 수동 업로드 1단계.
 *
 * 공통 pending→presign 전이는 `lib/server/presigned-upload/module.ts`가 소유한다.
 * 첨부와 다른 정책 — 메타(title/counterpartyName/contractedAt)를 여기서 함께 받는다
 * (pending 부터 title NOT NULL 이 성립해야 한다), PDF 전용(mime 파라미터
 * 없음, 항상 application/pdf 로 presign), 그리고 워크스페이스당 업로드
 * 200건 캡(`countUploadsByWorkspace` — pending 포함, 버려진 presign 은 1h
 * sweep 이 청소하므로 캡 판정엔 그대로 반영한다) + PG 멤버십 승인 게이트가
 * 추가된다.
 *
 * Phase 2(`POST /api/contract-archives/[id]/complete`)가 실제 업로드를
 * 재검증하고 행을 `pending`→`ready` 로 전이한다.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { getStorage } from '@/lib/server/storage';
import { MAX_ARCHIVE_DOC_BYTES } from '@/lib/contract-archive/limits';
import { createPresignedUploadModule } from '@/lib/server/presigned-upload/module';
import { createArchiveUploadAdapter } from '@/lib/server/presigned-upload/archive-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PresignInput = z
  .object({
    name: z.string().min(1).max(255),
    size: z.number().int().min(1).max(MAX_ARCHIVE_DOC_BYTES),
    title: z.string().min(1).max(200),
    counterpartyName: z.string().min(1).max(200).optional(),
    contractedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

function unexpectedBeginRejection(reason: never): Response {
  void reason;
  return fail(500, 'PRESIGN_FAILED');
}

export async function POST(req: Request): Promise<Response> {
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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail(400, 'INVALID_JSON');
  }

  const parsed = PresignInput.safeParse(json);
  if (!parsed.success) {
    // Size out-of-range collapses into 400 by default from zod, but a
    // too-large size gets its own status (413) per the files presign
    // route's convention — check that specific case before the generic
    // 400.
    const tooLarge = parsed.error.issues.some(
      (i) =>
        i.path[0] === 'size' &&
        typeof json === 'object' &&
        json !== null &&
        typeof (json as { size?: unknown }).size === 'number' &&
        (json as { size: number }).size > MAX_ARCHIVE_DOC_BYTES,
    );
    if (tooLarge) return fail(413, 'FILE_TOO_LARGE');
    return fail(400, 'INVALID_INPUT');
  }
  const input = parsed.data;
  const contractedAt = input.contractedAt ? new Date(input.contractedAt) : null;
  if (contractedAt && Number.isNaN(contractedAt.getTime())) {
    return fail(400, 'INVALID_INPUT');
  }

  const uploads = createPresignedUploadModule({
    adapter: createArchiveUploadAdapter(),
    storage: getStorage(),
  });
  const result = await uploads.begin(
    { userId: session.user.id, workspaceId: wsId },
    { ...input, contractedAt },
  );
  if (!result.ok) {
    if (result.reason === 'presign-failed') return fail(500, 'PRESIGN_FAILED');
    if (result.reason === 'file-too-large') return fail(413, 'FILE_TOO_LARGE');
    if (result.reason === 'upload-limit') return fail(403, 'UPLOAD_LIMIT');
    if (result.reason === 'forbidden') return fail(403, 'FORBIDDEN');
    return unexpectedBeginRejection(result.reason);
  }
  return NextResponse.json({ id: result.id, uploadUrl: result.uploadUrl });
}
