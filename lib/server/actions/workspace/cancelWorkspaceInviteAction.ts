'use server';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceService } from '@/lib/server/services/workspace';

export type CancelWorkspaceInviteResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin-only: cancel a pending workspace invitation by email.
 * Sets the invitation status to 'expired' (preserving audit trail).
 */
export async function cancelWorkspaceInviteAction(input: {
  email: string;
}): Promise<CancelWorkspaceInviteResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  if (!session.user.workspaceId) return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };

  const actor = { userId: session.user.id, workspaceId: session.user.workspaceId };
  const service = await getWorkspaceService();
  return service.cancelInvite({ email: input.email }, actor);
}
