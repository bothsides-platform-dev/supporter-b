// Single source for the account-deletion pre-check. `AuthService.deleteAccount`
// (the enforcing path) and the `getDeleteAccountStatus` action (the read-only
// pre-check the dialog renders) used to carry verbatim copies of this loop,
// which let the warning the user reads drift away from the rule that actually
// blocks them.
import { isApprovedAdmin } from '@/lib/auth/active-workspace';
import type { MemberApprovalStatus } from '@/lib/types/workspace';

export type DeletionMember = {
  userId: string;
  role: string;
  approvalStatus: MemberApprovalStatus;
  isSystemAccount: boolean;
};

export type DeletionMembership = {
  workspaceId: string;
  name: string;
  role: string;
  approvalStatus: MemberApprovalStatus;
  members: DeletionMember[];
};

export type WorkspaceStub = { id: string; name: string };

export type BlockingWorkspace = WorkspaceStub & {
  /**
   * Is there anyone the user could actually hand admin over to? False when every
   * remaining member is pending/rejected (cannot hold effective admin) or a
   * system account (filtered out of every member list in the UI). The dialog
   * uses this to avoid telling people to delegate to somebody who cannot take
   * the role, or whom they cannot even see.
   */
  hasDelegatableMember: boolean;
};

export type AccountDeletionClassification = {
  blockingWorkspaces: BlockingWorkspace[];
  soloWorkspaces: WorkspaceStub[];
};

/**
 * Classify each of the user's workspaces for account deletion.
 *
 * - `soloWorkspaces` — the user is the only member; the workspace is deleted
 *   along with the account.
 * - `blockingWorkspaces` — the user is the last *effective* admin while other
 *   members remain, so deletion is refused.
 *
 * Deliberately fail-closed: a workspace with any other member is never treated
 * as solo, so deletion never silently destroys a workspace somebody else is
 * still waiting to join.
 */
export function classifyAccountDeletion(
  memberships: DeletionMembership[],
  userId: string,
): AccountDeletionClassification {
  const blockingWorkspaces: BlockingWorkspace[] = [];
  const soloWorkspaces: WorkspaceStub[] = [];

  for (const membership of memberships) {
    const allMembers = membership.members;
    const stub: WorkspaceStub = { id: membership.workspaceId, name: membership.name };

    if (allMembers.length === 1) {
      soloWorkspaces.push(stub);
      continue;
    }

    if (!isApprovedAdmin(membership)) continue;

    const others = allMembers.filter((m) => m.userId !== userId);
    if (others.some((m) => isApprovedAdmin(m))) continue;

    blockingWorkspaces.push({
      ...stub,
      hasDelegatableMember: others.some(
        (m) => m.approvalStatus === 'approved' && !m.isSystemAccount,
      ),
    });
  }

  return { blockingWorkspaces, soloWorkspaces };
}
