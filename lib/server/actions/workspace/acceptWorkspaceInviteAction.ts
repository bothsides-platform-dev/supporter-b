'use server';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceService } from '@/lib/server/services/workspace';

export type AcceptWorkspaceInviteResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

/**
 * Claim a workspace invitation token.
 */
export async function acceptWorkspaceInviteAction(
  rawToken: string,
): Promise<AcceptWorkspaceInviteResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const actor = {
    userId: session.user.id,
    userEmail: session.user.email ?? '',
    workspaceId: session.user.workspaceId ?? '',
  };

  const service = await getWorkspaceService();
  return service.acceptInvite(rawToken, actor);
}
