/**
 * POST /api/contract-archives/{id}/complete — 계약 보관함 수동 업로드 2단계.
 *
 * `app/api/files/[id]/complete/route.ts`(attachments 2-phase presign)의
 * 미러다. 클라이언트가 `POST /api/contract-archives/presign` 이 발급한
 * presigned URL 로 직접 PUT 한 뒤 이 라우트를 호출하면, 서버가 객체를
 * 독립적으로 재검증(클라이언트 자기신고를 신뢰하지 않음)하고 행을
 * `status: 'pending'` → `'ready'` 로 전이한다.
 *
 * 검증 순서(각 실패는 그 호출의 종결):
 *   1. 행 존재 / `source==='upload'` / 소유(`createdBy`) — 라우트 소관이
 *      아닌 signing 출처 행은 404, 남의 업로드는 403.
 *   2. 이미 `ready` 면 스토리지 재검증 없이 200 멱등.
 *   3. `storage.head(documentKey)` — ENOENT 면 PUT 이 아직 안 붙은 것.
 *      행은 유지(재시도 가능) — 방치된 pending 은 `deleteStaleUploadPending`
 *      스윕이 청소한다.
 *   4. 크기 검사 — `head.size !== row.documentSize`. 방어적 레이어일 뿐
 *      (presigned 서명에 이미 Content-Length 가 포함) — 종결: 객체+행 삭제.
 *   5. 매직바이트 스니핑(첫 4KB) — PDF 가 아니면 종결: 객체+행 삭제.
 *   6. `markUploadReady(id)` — pending 행만 ready 로 전이(멱등 안전망은
 *      2번의 fast-path).
 *
 * Auth: 3-layer 세션 게이트(auth / isSessionRevoked / isEmailUnverified) +
 * PG 멤버십 승인 게이트(신규 /api 라우트 인라인 배선 규칙) — 다른
 * contract-archives 라우트와 동일.
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { getContractArchiveRepo } from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { sniffMime } from '@/lib/server/storage/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SNIFF_BYTES = 4096;

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

async function readSniffBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks as unknown as Uint8Array[]);
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
  if (!id) return fail(400, 'INVALID_INPUT');

  const repo = await getContractArchiveRepo();
  const row = await repo.findById(id);
  if (!row) return fail(404, 'NOT_FOUND');
  // 이 라우트는 수동 업로드 전용 — signing 출처 행은 여기 소관이 아니다.
  if (row.source !== 'upload') return fail(404, 'NOT_FOUND');
  if (row.createdBy !== session.user.id) return fail(403, 'FORBIDDEN');

  if (row.status === 'ready') {
    return NextResponse.json({ id: row.id });
  }

  const key = row.documentKey;
  if (!key || row.documentSize === null) {
    // pending upload 행은 insertPendingUpload 가 항상 documentKey/documentSize
    // 를 채운다 — 도달하면 데이터 불변식이 깨진 것.
    return fail(500, 'INVALID_STATE');
  }

  const storage = getStorage();

  let head: { size: number };
  try {
    head = await storage.head(key);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // 아직 PUT 이 안 붙음 — 행은 유지, 클라이언트가 재시도한다.
      // 방치된 pending 은 sweep(deleteStaleUploadPending)이 회수.
      return fail(409, 'NOT_UPLOADED');
    }
    throw err;
  }

  if (head.size !== row.documentSize) {
    await storage.delete(key).catch(() => {});
    await repo.removeUpload(id).catch(() => {});
    return fail(400, 'SIZE_MISMATCH');
  }

  const { stream } = await storage.read(key, { start: 0, end: SNIFF_BYTES - 1 });
  const head4k = await readSniffBuffer(stream);
  const sniffed = sniffMime(head4k);
  if (sniffed !== 'application/pdf') {
    await storage.delete(key).catch(() => {});
    await repo.removeUpload(id).catch(() => {});
    return fail(415, 'MIME_MISMATCH');
  }

  await repo.markUploadReady(id);

  return NextResponse.json({ id: row.id });
}
