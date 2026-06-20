import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { getUserAvatarRepo } from '@/lib/server/repositories/factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
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
