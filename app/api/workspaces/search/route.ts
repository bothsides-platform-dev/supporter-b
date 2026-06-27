/**
 * GET /api/workspaces/search?q=&type=pg|buyer
 *
 * 워크스페이스 이름 검색 endpoint. q 없이 호출하면 전체 목록 반환(최대 500건).
 * 인증 필수(buyer·pg 양쪽) — 비인증 PG 디렉터리 노출을 막는다.
 * runtime='nodejs' — postgres-js는 Node-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { searchWorkspaces } from '@/lib/server/workspaces/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().max(100).optional(),
  type: z.enum(['buyer', 'pg']).default('pg'),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = QuerySchema.safeParse({
    q: searchParams.get('q') ?? undefined,
    type: searchParams.get('type') ?? 'pg',
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, type } = parsed.data;

  // 인증 필수 — buyer·pg 양쪽. PG 디렉터리(type=pg)도 비공개화: 비인증 노출은 봉인입찰
  // 비익명화 오라클이 된다(딜룸 RSC 누출과 결합 시 경쟁사 신원 복원). 유일한 정규 호출자
  // (견적요청 위저드 PG 피커)는 인증된 buyer 라 기능 영향 없음.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  // 이메일 미인증 세션 거부.
  if (await isEmailUnverified(session)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const rows = await searchWorkspaces({ type, q });

  const nameCount = new Map<string, number>();
  for (const row of rows) {
    nameCount.set(row.name, (nameCount.get(row.name) ?? 0) + 1);
  }

  const result = rows.map((row) => ({
    id: row.id,
    name: row.name,
    displayName:
      (nameCount.get(row.name) ?? 1) > 1
        ? `${row.name} #${row.id.slice(0, 8)}`
        : row.name,
    logoUpdatedAt: row.logoUpdatedAt,
  }));

  return NextResponse.json({ workspaces: result });
}
