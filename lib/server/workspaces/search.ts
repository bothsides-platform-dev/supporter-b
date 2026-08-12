import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

/** ilike 메타문자 이스케이프 (사용자 입력 q 용). */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

/**
 * 워크스페이스 이름 검색. 데이터 접근은 WorkspaceRepo.search 에 위임(escapeIlike·limit 동일).
 * active 만 반환하며, `includeTest` 를 주지 않으면 테스트용 PG 도 빠진다
 * (규칙·해제 쿠키: `lib/features/test-pg.ts`).
 */
export async function searchWorkspaces(
  opts: { type: 'buyer' | 'pg'; q?: string; includeTest?: boolean },
): Promise<{ id: string; name: string; logoUpdatedAt: string | null }[]> {
  return (await getWorkspaceRepo()).search(opts);
}
