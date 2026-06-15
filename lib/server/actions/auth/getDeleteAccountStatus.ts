'use server';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export type WorkspaceStub = { id: string; name: string };

export type GetDeleteAccountStatusResult =
  | { ok: true; blockingWorkspaces: WorkspaceStub[]; soloWorkspaces: WorkspaceStub[] }
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

  const blockingWorkspaces: WorkspaceStub[] = [];
  const soloWorkspaces: WorkspaceStub[] = [];

  for (const membership of myMemberships) {
    const allMembers = membership.members;

    const stub: WorkspaceStub = { id: membership.workspaceId, name: membership.name };

    if (allMembers.length === 1) {
      soloWorkspaces.push(stub);
    } else if (membership.role === 'admin') {
      const otherAdmins = allMembers.filter(
        (m: { userId: string; role: string }) => m.userId !== userId && m.role === 'admin',
      );
      if (otherAdmins.length === 0) {
        blockingWorkspaces.push(stub);
      }
    }
  }

  return { ok: true, blockingWorkspaces, soloWorkspaces };
}
