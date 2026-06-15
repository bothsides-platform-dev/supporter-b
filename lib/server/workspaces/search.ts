import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

/** ilike 메타문자 이스케이프 (사용자 입력 q 용). */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

/**
 * 워크스페이스 이름 검색. 데모 PG(isDemo)는 항상 제외 — 구매사 PG 피커/검색에 노출되면
 * 실제 RFP 초대·이메일이 가짜 PG로 나가므로(봉인입찰/온보딩 격리) 절대 포함하지 않는다.
 * 데이터 접근은 WorkspaceRepo.search 에 위임(escapeIlike·isDemo 제외·limit 동일).
 * `db` 파라미터는 호출부 시그니처 호환을 위해 유지하나 더 이상 쿼리에 쓰지 않는다(레포가 소유).
 */
export async function searchWorkspaces(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any,
  opts: { type: 'buyer' | 'pg'; q?: string },
): Promise<{ id: string; name: string }[]> {
  return (await getWorkspaceRepo()).search(opts);
}
