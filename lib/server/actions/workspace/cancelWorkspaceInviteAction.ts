'use server';

import { and, eq, sql } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { getMembership } from '@/lib/auth/active-workspace';
import { workspaceInvitations } from '@/lib/db/schema';
import { actionDb, normalizeEmail } from '@/lib/server/actions/auth/_shared';

export type CancelWorkspaceInviteResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin-only: cancel a pending workspace invitation by email.
 *
 * Sets the invitation status to 'expired' rather than deleting it, so the audit
 * trail is preserved and the partial unique index
 * `(workspace_id, lower(invited_email)) WHERE status='pending'` is released,
 * allowing the same email to be re-invited.
 *
 * Authorization is checked against the caller's CURRENT DB role
 * (`getMembership`), not the JWT — a just-demoted admin with a stale token
 * must not retain cancellation powers.
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

  const workspaceId = session.user.workspaceId;
  if (!workspaceId) return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };

  const db = actionDb();

  // Verify against the current DB role, not the (possibly stale) JWT.
  const membership = await getMembership(db, session.user.id, workspaceId);
  if (!membership || membership.role !== 'admin') {
    return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
  }

  const normalizedEmail = normalizeEmail(input.email);

  const updated = await db
    .update(workspaceInvitations)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(workspaceInvitations.workspaceId, workspaceId),
        eq(workspaceInvitations.status, 'pending'),
        sql`lower(${workspaceInvitations.invitedEmail}) = ${normalizedEmail}`,
      ),
    )
    .returning({ id: workspaceInvitations.id });

  if (updated.length === 0) {
    return { ok: false, error: 'INVITE_NOT_FOUND' };
  }

  return { ok: true };
}
