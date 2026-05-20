'use server';

import { eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { unstable_update } from '@/auth';
import { users } from '@/lib/db/schema';
import { getMembership } from '@/lib/auth/active-workspace';
import { actionDb } from '../auth/_shared';

export type SwitchWorkspaceResult =
  | { ok: true; redirectTo: '/home' }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_INPUT' | 'NOT_MEMBER' };

/**
 * Switch the caller's active workspace.
 *
 * Membership is re-validated against the DB and the workspace type + role are
 * re-derived from the TARGET membership (cross-type switching). The remembered
 * `lastActiveWorkspaceId` is persisted, then the new active workspace is pushed
 * into the JWT via `unstable_update` (re-runs the jwt callback's update branch).
 * Caller lands on /home — renders for both workspace types, so it never trips
 * the requireBuyerSession/requirePgSession type guards mid-switch.
 */
export async function switchWorkspaceAction(
  targetWorkspaceId: string,
): Promise<SwitchWorkspaceResult> {
  const session = await requireSession().catch(() => null);
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHENTICATED' };

  if (!targetWorkspaceId || typeof targetWorkspaceId !== 'string') {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  const db = actionDb();
  const membership = await getMembership(db, session.user.id, targetWorkspaceId);
  if (!membership) return { ok: false, error: 'NOT_MEMBER' };

  await db
    .update(users)
    .set({ lastActiveWorkspaceId: membership.workspaceId })
    .where(eq(users.id, session.user.id));

  await unstable_update({
    user: {
      workspaceId: membership.workspaceId,
      workspaceType: membership.workspaceType,
      role: membership.role,
    },
  });

  return { ok: true, redirectTo: '/home' };
}
