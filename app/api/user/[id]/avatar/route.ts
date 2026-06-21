import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { getUserAvatarRepo } from '@/lib/server/repositories/factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  // 로그인 세션만 확인(폐기 세션 sv 검사는 의도적 생략 — 읽기 전용·저민감 프로필 이미지,
  // 스펙 §4.3/Known limitations). 쓰기(POST/DELETE)는 sv·이메일 인증까지 검사한다.
  // 개인 사진 — 로그인 세션 필수(워크스페이스 로고의 공개 GET과 다름).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await (await getUserAvatarRepo()).find(id);
  if (!row) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  // Copy into a plain ArrayBuffer-backed view so the bytes satisfy BodyInit.
  const body = new Uint8Array(row.bytes);
  return new Response(body, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(body.length),
      // URL carries ?v={avatar_updated_at} → version change = new URL = fresh fetch.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
