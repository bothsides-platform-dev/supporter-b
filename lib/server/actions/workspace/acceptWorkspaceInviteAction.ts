'use server';

import { eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { workspaceInvitations, workspaceMembers } from '@/lib/db/schema';
import { hashToken } from '@/lib/server/token';
import { actionDb, normalizeEmail } from '@/lib/server/actions/auth/_shared';

export type AcceptWorkspaceInviteResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

/**
 * Claim a workspace invitation token.
 *
 * Validation order (per spec):
 *   1. Token lookup — INVITE_INVALID if not found
 *   2. Status/expiry check — INVITE_EXPIRED if not pending or expired
 *   3. Email match — INVITE_EMAIL_MISMATCH (checked before burning the invite)
 *   4. Atomic: mark accepted + insert workspace_members (ON CONFLICT DO NOTHING)
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

  const userId = session.user.id;
  const userEmail = session.user.email ?? '';

  const tokenHash = hashToken(rawToken);
  const db = actionDb();

  // Look up invitation by token hash
  const [invitation] = await db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!invitation) return { ok: false, error: 'INVITE_INVALID' };

  if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
    return { ok: false, error: 'INVITE_EXPIRED' };
  }

  // Email match check (case-insensitive) — before any write
  if (normalizeEmail(invitation.invitedEmail) !== normalizeEmail(userEmail)) {
    return { ok: false, error: 'INVITE_EMAIL_MISMATCH' };
  }

  const result = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<AcceptWorkspaceInviteResult> => {
      // Mark invitation as accepted
      await tx
        .update(workspaceInvitations)
        .set({ status: 'accepted', acceptedByUserId: userId })
        .where(eq(workspaceInvitations.id, invitation.id));

      // Add to workspace — ON CONFLICT DO NOTHING handles already-member race
      await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
        })
        .onConflictDoNothing();

      return { ok: true, workspaceId: invitation.workspaceId };
    },
  );

  return result;
}
