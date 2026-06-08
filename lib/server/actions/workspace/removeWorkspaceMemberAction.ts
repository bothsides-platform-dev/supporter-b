'use server';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceService } from '@/lib/server/services/workspace';

export type RemoveWorkspaceMemberResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin-only: remove (kick) a member from the current workspace.
 * Authorization is checked against the caller's CURRENT DB role, not the JWT.
 */
export async function removeWorkspaceMemberAction(input: {
  userId: string;
}): Promise<RemoveWorkspaceMemberResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const workspaceId = session.user.workspaceId;
  if (!workspaceId) return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };

  const actor = { userId: session.user.id, workspaceId };
  const service = await getWorkspaceService();
  return service.removeMember({ targetUserId: input.userId }, actor);
}
