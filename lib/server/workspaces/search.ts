import { and, eq, ilike } from 'drizzle-orm';
import { workspaces } from '@/lib/db/schema';

/** ilike 메타문자 이스케이프 (사용자 입력 q 용). */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

/**
 * 워크스페이스 이름 검색. 데모 PG(isDemo)는 항상 제외 — 구매사 PG 피커/검색에 노출되면
 * 실제 RFP 초대·이메일이 가짜 PG로 나가므로(봉인입찰/온보딩 격리) 절대 포함하지 않는다.
 * db 는 호출부가 주입(테스트는 pglite). limit: q 있으면 20, 없으면 500.
 */
export async function searchWorkspaces(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  opts: { type: 'buyer' | 'pg'; q?: string },
): Promise<{ id: string; name: string }[]> {
  const { type, q } = opts;
  const base = and(eq(workspaces.type, type), eq(workspaces.isDemo, false));
  return db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(q ? and(base, ilike(workspaces.name, `%${escapeIlike(q)}%`)) : base)
    .limit(q ? 20 : 500);
}
