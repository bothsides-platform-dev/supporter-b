/**
 * GET /api/workspaces/search?q=&type=pg
 *
 * PG 워크스페이스 이름 검색 endpoint. q 없이 호출하면 전체 목록 반환(최대 500건).
 * runtime='nodejs' — postgres-js는 Node-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/auth';
import { isSessionRevoked } from '@/lib/auth/session';
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

  if (type === 'buyer') {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
    if (await isSessionRevoked(session)) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
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
  }));

  return NextResponse.json({ workspaces: result });
}
