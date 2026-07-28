'use server';

import { requireSession } from '@/lib/auth/session';
import { classifyAccountDeletion } from '@/lib/auth/account-deletion';
import type { BlockingWorkspace, WorkspaceStub } from '@/lib/auth/account-deletion';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export type { BlockingWorkspace, WorkspaceStub };

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
