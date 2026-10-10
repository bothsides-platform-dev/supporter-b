import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

/**
 * 워크스페이스 이름 검색. 데이터 접근·ilike 이스케이프·limit 은 WorkspaceRepo.search 가 소유한다.
 * active 만 반환하며, `includeTest` 를 주지 않으면 테스트용 PG 도 빠진다
 * (규칙·해제 쿠키: `lib/features/test-pg.ts`).
 */
export async function searchWorkspaces(
  opts: { type: 'buyer' | 'pg'; q?: string; includeTest?: boolean },
): Promise<{ id: string; name: string; logoUpdatedAt: string | null }[]> {
  return (await getWorkspaceRepo()).search(opts);
}
