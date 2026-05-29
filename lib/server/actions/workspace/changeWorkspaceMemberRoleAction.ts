'use server';

import { and, eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { getMembership } from '@/lib/auth/active-workspace';
import { workspaceMembers } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type ChangeWorkspaceMemberRoleResult =
  | { ok: true }
  | { ok: false; error: string };

const ROLES = ['admin', 'member'] as const;

/**
 * Admin-only: change an existing member's role (promote/demote).
 *
 * Authorization is checked against the caller's CURRENT DB role
 * (`getMembership`), not the JWT. Demoting the workspace's only admin is
 * rejected (LAST_ADMIN) so the workspace never ends up admin-less — this also
 * covers an admin trying to demote themselves while sole admin.
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

  if (!ROLES.includes(input.role)) {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  const db = actionDb();

  // Verify against the current DB role, not the (possibly stale) JWT.
  const membership = await getMembership(db, session.user.id, workspaceId);
  if (!membership || membership.role !== 'admin') {
    return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
  }

  const [target] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, input.userId),
      ),
    )
    .limit(1);
  if (!target) return { ok: false, error: 'MEMBER_NOT_FOUND' };

  // Block demoting the last remaining admin.
  if (input.role === 'member' && target.role === 'admin') {
    const admins = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
        ),
      );
    if (admins.length <= 1) return { ok: false, error: 'LAST_ADMIN' };
  }

  await db
    .update(workspaceMembers)
    .set({ role: input.role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, input.userId),
      ),
    );

  return { ok: true };
}
