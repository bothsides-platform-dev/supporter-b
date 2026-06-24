'use server';

import { requireSession } from '@/lib/auth/session';
import { getWorkspaceService } from '@/lib/server/services/workspace';
import type { WorkspaceActionResult } from './_shared';

export type ChangeWorkspaceMemberRoleResult = WorkspaceActionResult;

const ROLES = ['admin', 'member'] as const;

/**
 * Admin-only: change an existing member's role (promote/demote).
 * Authorization is checked against the caller's CURRENT DB role, not the JWT.
 */
export async function changeWorkspaceMemberRoleAction(input: {
  userId: string;
  role: 'admin' | 'member';
}): Promise<ChangeWorkspaceMemberRoleResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const workspaceId = session.user.workspaceId;
  if (!workspaceId) return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };

  if (!ROLES.includes(input.role)) return { ok: false, error: 'INVALID_INPUT' };

  const actor = { userId: session.user.id, workspaceId };
  const service = await getWorkspaceService();
  return service.changeMemberRole({ targetUserId: input.userId, role: input.role }, actor);
}
