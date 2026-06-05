'use server';

import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export async function checkMyWorkspaceApprovalAction(): Promise<{ approved: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { approved: false };

  const repo = await getWorkspaceRepo();
  const list = await repo.listForUser(userId);
  return { approved: list.some((w) => w.status === 'active') };
}
