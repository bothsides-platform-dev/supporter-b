import { defineAsyncSingleton } from '@/lib/server/_singleton';
import type { Tx } from '@/lib/server/repositories/types';
import { createWorkspaceInTx, type CreateWorkspaceInput, type WorkspaceCreationRepos } from './workspace-membership/create-workspace';
import { claimInviteInTx, type InvitationClaimInput } from './workspace-membership/claim-invitation';
import { dispatchWorkspaceInviteInApp } from './workspace-membership/notify-invitation';
export type { CreateWorkspaceBizProfile } from './workspace-membership/create-workspace';

/** Shared membership writes; the calling use case owns the surrounding transaction. */
export class WorkspaceMembership {
  constructor(private readonly repos: WorkspaceCreationRepos) {}

  create(tx: Tx, input: CreateWorkspaceInput) {
    return createWorkspaceInTx(tx, input, this.repos);
  }

  claimInvitation(tx: Tx, invitation: InvitationClaimInput, userId: string) {
    return claimInviteInTx(tx, invitation, userId, this.repos);
  }

  notifyInvitation(tx: Tx, input: { invitedEmail: string; workspaceName: string; linkUrl: string }) {
    return dispatchWorkspaceInviteInApp(tx, input, this.repos.userRepo);
  }
}

export const { get: getWorkspaceMembership } = defineAsyncSingleton('workspace_membership', 'service', async () => {
  const { getBizProfileRepo, getColumnRepo, getRiskFlagRepo, getUserRepo, getVerificationApplicationRepo, getWorkspaceRepo } =
    await import('@/lib/server/repositories/factory');
  const [bizProfileRepo, columnRepo, riskFlagRepo, userRepo, verificationApplicationRepo, workspaceRepo] = await Promise.all([
    getBizProfileRepo(), getColumnRepo(), getRiskFlagRepo(), getUserRepo(), getVerificationApplicationRepo(), getWorkspaceRepo(),
  ]);
  return new WorkspaceMembership({ bizProfileRepo, columnRepo, riskFlagRepo, userRepo, verificationApplicationRepo, workspaceRepo });
});
