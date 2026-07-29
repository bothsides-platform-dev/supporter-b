import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getMembership, isApprovedAdmin } from '@/lib/auth/active-workspace';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
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

/**
 * 로고 쓰기(업로드·삭제)의 공통 게이트.
 *
 * 로고는 워크스페이스 정체성이라 이름·사업자번호와 같은 층위다 — 그 둘은
 * `renameWorkspaceAction`·`updateWorkspaceBizProfileAction` 에서 승인된 admin 만
 * 통과한다. 여기만 열려 있으면 같은 설정 패널의 세 컨트롤 중 하나가 무게이트다.
 *
 * 세션의 role 을 믿지 않고 DB 를 다시 읽는 이유는 두 액션과 같다: JWT 는 stale 할
 * 수 있고, 미승인 admin(canonical-PG 합류자)도 role='admin' 으로 들어온다.
 *
 * 반환값이 있으면 그 응답으로 즉시 종료한다(null 이면 통과).
 */
async function guardWrite(
  // `auth` 는 오버로드라 ReturnType 이 NextMiddleware 로 풀린다 — Session 을 직접 쓴다.
  session: Session | null,
  targetWsId: string,
): Promise<Response | null> {
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  // 이메일 미인증 세션 거부.
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');

  // 지금 들어와 있는 워크스페이스만 건드릴 수 있다. 다른 워크스페이스의 admin
  // 이더라도 그쪽으로 전환하지 않은 채로는 못 바꾼다.
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  if (wsId !== targetWsId) return fail(403, 'FORBIDDEN');

  // 마스터/운영자는 workspace_members row 자체가 없다(synthetic admin) —
  // 멤버십으로 판정하는 게이트는 이메일로 따로 면제해야 잠기지 않는다.
  const email = (session.user as { email?: string }).email;
  if (isMasterEmail(email)) return null;

  const membership = await getMembership(session.user.id, targetWsId);
  if (!isApprovedAdmin(membership)) return fail(403, 'FORBIDDEN_NOT_ADMIN');

  return null;
}

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
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const denied = await guardWrite(await auth(), id);
  if (denied) return denied;

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
  await (await getWorkspaceRepo()).setLogoUpdatedAt(id, new Date());

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext,
): Promise<Response> {
  const { id } = await ctx.params;
  const denied = await guardWrite(await auth(), id);
  if (denied) return denied;

  await (await getWorkspaceLogoRepo()).remove(id);
  await (await getWorkspaceRepo()).setLogoUpdatedAt(id, null);

  return NextResponse.json({ ok: true });
}
