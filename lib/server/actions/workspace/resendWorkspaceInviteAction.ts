'use server';

import { and, eq, sql } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { getMembership } from '@/lib/auth/active-workspace';
import { workspaceInvitations, workspaces } from '@/lib/db/schema';
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { generateToken, hashToken } from '@/lib/server/token';
import { renderWorkspaceInvited } from '@/lib/server/outbox/templates/workspaceInvited';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { actionDb, baseUrl, normalizeEmail } from '@/lib/server/actions/auth/_shared';

export type ResendWorkspaceInviteResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin-only: resend the invitation email for a pending workspace invitation.
 *
 * Rotates the invitation token (old link is immediately invalidated — one live
 * token per workspace+email at all times) and re-enqueues the outbox email.
 *
 * The dedupeKey uses the new tokenHash, not a time bucket, so every resend
 * produces a unique key and the outbox does not deduplicate within the same
 * 15-minute window. Double-submit protection is handled by the client's
 * useTransition disabled state.
 *
 * Authorization is checked against the caller's CURRENT DB role
 * (`getMembership`), not the JWT.
 */
export async function resendWorkspaceInviteAction(input: {
  email: string;
}): Promise<ResendWorkspaceInviteResult> {
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

  // Look up workspace name for the email body.
  const [wsRow] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!wsRow) return { ok: false, error: 'WORKSPACE_NOT_FOUND' };

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const result = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<ResendWorkspaceInviteResult> => {
      const updated = await tx
        .update(workspaceInvitations)
        .set({ tokenHash, expiresAt, updatedAt: new Date() })
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

      const inviteUrl = `${baseUrl()}/invite/workspace/${rawToken}`;
      const html = await renderWorkspaceInvited({ workspaceName: wsRow.name, inviteUrl });
      const outbox = await getOutboxRepo();
      // dedupeKey is tokenHash-based (not time-bucket) so each resend produces
      // a unique key and bypasses the outbox's onConflictDoNothing guard.
      await outbox.enqueue(
        {
          event: 'workspace.invited',
          to: normalizedEmail,
          subject: '[Supporter B] 워크스페이스 초대장',
          html,
          dedupeKey: `ws-invite-resend:${workspaceId}:${normalizedEmail}:${tokenHash}`,
        },
        tx,
      );

      return { ok: true };
    },
  );

  if (result.ok) {
    flushAfterCommit();
  }
  return result;
}
