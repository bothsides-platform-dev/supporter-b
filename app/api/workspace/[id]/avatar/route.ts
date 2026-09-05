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
// (canonical PG 로고 SVG 원본은 `scripts/assets/pg-logos/` 에 남아 있지만 이를 DB 에
//  넣던 backfill 스크립트는 d067e858 에서 제거됐다 — 지금은 시드 경로가 없고, SVG 가
//  blob 테이블에 들어갈 유일한 길은 repo 계층 직접 쓰기다. 이 라우트는 아니다.)
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 로고 쓰기(업로드·삭제)의 공통 게이트.
 *
 * 로고는 워크스페이스 정체성이라 이름·사업자번호와 같은 층위다 — 그 둘은
 * `requestWorkspaceNameChangeAction`·`updateWorkspaceBizProfileAction` 에서 승인된 admin 만
 * 통과한다. 여기만 열려 있으면 같은 설정 패널의 세 컨트롤 중 하나가 무게이트다.
 *
 * 세션의 role 을 믿지 않고 DB 를 다시 읽는 이유는 두 액션과 같다: JWT 는 stale 할
 * 수 있고, 미승인 admin(canonical-PG 합류자)도 role='admin' 으로 들어온다.
 *
 * 반환값이 있으면 그 응답으로 즉시 종료한다(null 이면 통과).
 */
async function guardWrite(
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
  //
  // 구조적 캐스트를 쓰지 않는다 — `types/next-auth.d.ts` 가 email·workspaceId 를
  // 이미 선언하므로, 캐스트는 보장된 string 을 `string | undefined` 로 **넓히고**
  // 증강이 사라져도 조용히 컴파일된다. 인증 판정의 입력값에 쓸 구문이 아니다.
  if (session.user.workspaceId !== targetWsId) return fail(403, 'FORBIDDEN');

  // 마스터/운영자는 workspace_members row 자체가 없다(synthetic admin) —
  // 멤버십으로 판정하는 게이트는 이메일로 따로 면제해야 잠기지 않는다.
  if (isMasterEmail(session.user.email)) return null;

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

  // 저장된 mime 을 그대로 되울리지 않는다. 이 GET 은 비인증이고 1년 immutable 캐시가
  // 붙는데, 쓰기 경로(POST)만 ALLOWED_MIMES + 매직바이트로 좁혀 두면 **이미 심긴 행**은
  // 그 경계 밖에 있다 — 삭제된 `backfill-pg-logos` 스크립트가 로고를 SVG 로 심었고,
  // 그런 행이 남아 있으면 앱 origin 에서 인라인 실행된다(저장형 XSS). 전역 nosniff 는
  // **명시된** image/svg+xml 을 막지 못하므로, 서빙 타입을 쓰기 허용목록으로 좁힌다.
  // 바이트는 손대지 않는다 — 해석 방식만 좁히는 게이트다.
  const served = ALLOWED_MIMES.has(row.mime) ? row.mime : 'application/octet-stream';

  return new Response(body, {
    headers: {
      'Content-Type': served,
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
