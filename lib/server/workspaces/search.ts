import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

/** ilike 메타문자 이스케이프 (사용자 입력 q 용). */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

/**
 * 워크스페이스 이름 검색. 데이터 접근은 WorkspaceRepo.search 에 위임(escapeIlike·limit 동일).
 */
export async function searchWorkspaces(
  opts: { type: 'buyer' | 'pg'; q?: string },
): Promise<{ id: string; name: string; logoUpdatedAt: string | null }[]> {
  return (await getWorkspaceRepo()).search(opts);
}
