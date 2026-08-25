'use server';

import { requireSession } from '@/lib/auth/session';
import { classifyAccountDeletion } from '@/lib/auth/account-deletion';
import type { BlockingWorkspace, WorkspaceStub } from '@/lib/auth/account-deletion';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

// ⚠️ 여기서 `export type { BlockingWorkspace, WorkspaceStub };` 로 되팔지 않는다.
// `'use server'` 모듈의 export 이름은 전부 서버 액션으로 등록되는데, `from` 절 없는
// 타입 재export 는 그 목록에 섞인 채 컴파일에서 지워져 **선언 없는 자유 식별자**가
// 산출물에 남는다 → 모듈 평가 시 `ReferenceError` 로 이 페이지의 액션이 전부 죽는다
// (`next build` 는 통과한다). 타입은 원본 `@/lib/auth/account-deletion` 에서 직접
// 가져다 쓴다. 가드: `lib/server/actions/__tests__/use-server-type-reexport.test.ts`.

export type GetDeleteAccountStatusResult =
  | { ok: true; blockingWorkspaces: BlockingWorkspace[]; soloWorkspaces: WorkspaceStub[] }
  | { ok: false; error: string };

/**
 * Read-only pre-check: 탈퇴 전 워크스페이스 admin 제약을 미리 확인한다.
 * - blockingWorkspaces: 본인이 마지막 admin이고 다른 멤버가 있는 워크스페이스
 * - soloWorkspaces: 본인이 유일한 멤버인 워크스페이스 (탈퇴 시 자동 삭제 예정)
 */
export async function getDeleteAccountStatus(): Promise<GetDeleteAccountStatusResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const userId = session.user.id;

  const myMemberships = await (
    await getWorkspaceRepo()
  ).listMembershipsWithMembers(userId);

  // Same classifier the enforcing `AuthService.deleteAccount` path runs, so the
  // dialog can never promise something the server then refuses (or vice versa).
  const { blockingWorkspaces, soloWorkspaces } = classifyAccountDeletion(myMemberships, userId);

  return { ok: true, blockingWorkspaces, soloWorkspaces };
}
