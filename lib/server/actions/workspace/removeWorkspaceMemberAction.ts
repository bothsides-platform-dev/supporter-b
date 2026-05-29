'use server';

import { and, eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { getMembership } from '@/lib/auth/active-workspace';
import { workspaceMembers } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type RemoveWorkspaceMemberResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin-only: remove (kick) a member from the current workspace.
 *
 * Authorization is checked against the caller's CURRENT DB role
 * (`getMembership`), not the JWT — a just-demoted admin with a stale token
 * must not retain kick powers.
 *
 * Guards: cannot remove yourself (SELF_REMOVAL). The workspace can never lose
 * its last admin via removal: removing another admin always leaves the caller
 * (also an admin), and removing yourself is blocked — so no LAST_ADMIN guard is
 * needed here (that lives in changeWorkspaceMemberRoleAction's demotion path).
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

  const db = actionDb();

  // Verify against the current DB role, not the (possibly stale) JWT.
  const membership = await getMembership(db, session.user.id, workspaceId);
  if (!membership || membership.role !== 'admin') {
    return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
  }

  if (input.userId === session.user.id) {
    return { ok: false, error: 'SELF_REMOVAL' };
  }

  const [target] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, input.userId),
      ),
    )
    .limit(1);
  if (!target) return { ok: false, error: 'MEMBER_NOT_FOUND' };

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, input.userId),
      ),
    );

  return { ok: true };
}
