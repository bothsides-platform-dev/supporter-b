'use server';

import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export async function checkMyMembershipApprovalAction(): Promise<{
  status: 'approved' | 'pending_approval' | 'rejected' | 'unknown';
}> {
  const session = await auth();
  const userId = session?.user?.id;
  const workspaceId = session?.user?.workspaceId;
  if (!userId || !workspaceId) return { status: 'unknown' };

  const repo = await getWorkspaceRepo();
  const approvalStatus = await repo.getMemberApprovalStatus(userId, workspaceId);
  return { status: approvalStatus ?? 'approved' };
}
