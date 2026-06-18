import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import {
  getWorkspaceLogoRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { sniffMime } from '@/lib/server/storage/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
// SVG는 의도적으로 제외: 사용자가 직접 내비게이션하면 <script>가 앱 origin에서 실행됨(XSS).
// SVG를 허용하려면 반드시 서버 측 sanitize + Content-Disposition: attachment 를 먼저 추가할 것.
// (canonical PG 로고 SVG는 `pnpm backfill:pg-logos` 스크립트를 통해서만 시드됨.)
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;

  const row = await (await getWorkspaceLogoRepo()).find(id);

  if (!row) return fail(404, 'NOT_FOUND');

  // Copy into a plain ArrayBuffer-backed view so the bytes satisfy BodyInit
  // (the repo returns a Node Buffer typed over ArrayBufferLike).
  const body = new Uint8Array(row.bytes);

  return new Response(body, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  // 이메일 미인증 세션 거부.
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  const { id } = await ctx.params;
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  if (wsId !== id) return fail(403, 'FORBIDDEN');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'INVALID_MULTIPART');
  }

  const rawFile = form.get('file');
  if (!(rawFile instanceof File)) return fail(400, 'FILE_REQUIRED');

  if (rawFile.size <= 0) return fail(400, 'EMPTY_FILE');
  if (rawFile.size > MAX_BYTES) return fail(413, 'FILE_TOO_LARGE');

  if (!ALLOWED_MIMES.has(rawFile.type)) return fail(415, 'MIME_NOT_ALLOWED');

  const buffer = Buffer.from(await rawFile.arrayBuffer());
  const sniffed = sniffMime(buffer);
  if (!sniffed || sniffed !== rawFile.type) return fail(415, 'MIME_MISMATCH');

  await (await getWorkspaceLogoRepo()).upsert(id, buffer, sniffed);
  await (await getWorkspaceRepo()).setHasLogo(id, true);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  // 이메일 미인증 세션 거부.
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  const { id } = await ctx.params;
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  if (wsId !== id) return fail(403, 'FORBIDDEN');

  await (await getWorkspaceLogoRepo()).remove(id);
  await (await getWorkspaceRepo()).setHasLogo(id, false);

  return NextResponse.json({ ok: true });
}
