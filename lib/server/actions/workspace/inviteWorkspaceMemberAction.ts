'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { workspaceInvitations, workspaces } from '@/lib/db/schema';
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { generateToken, hashToken } from '@/lib/server/token';
import { renderWorkspaceInvited } from '@/lib/server/outbox/templates/workspaceInvited';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { actionDb, baseUrl, bucket15Min, isUniqueViolation, normalizeEmail } from '@/lib/server/actions/auth/_shared';

const Input = z
  .object({
    email: z.string().email(),
    role: z.enum(['admin', 'member']).default('member'),
  })
  .strict();

export type InviteWorkspaceMemberResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin-only: invite an external user to the current workspace by email.
 *
 * Inserts into `workspace_invitations`, enqueues an outbox email, and
 * schedules a post-commit flush. The unique index on
 * `(workspace_id, lower(invited_email))` prevents duplicate invitations;
 * a 23505 violation is surfaced as ALREADY_INVITED.
 */
export async function inviteWorkspaceMemberAction(input: {
  email: string;
  role?: 'admin' | 'member';
}): Promise<InviteWorkspaceMemberResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  if (!session.user.workspaceId) {
    return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
  }
  if (session.user.role !== 'admin') {
    return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const role = parsed.data.role;
  const workspaceId = session.user.workspaceId;
  const invitedByUserId = session.user.id;

  const db = actionDb();

  // Look up workspace name for the email body
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
    async (tx: any): Promise<InviteWorkspaceMemberResult> => {
      try {
        await tx.insert(workspaceInvitations).values({
          workspaceId,
          invitedEmail: normalizedEmail,
          invitedByUserId,
          role,
          tokenHash,
          expiresAt,
          status: 'pending',
        });
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: 'ALREADY_INVITED' };
        throw err;
      }

      const inviteUrl = `${baseUrl()}/invite/workspace/${rawToken}`;
      const html = await renderWorkspaceInvited({
        workspaceName: wsRow.name,
        inviteUrl,
      });
      const outbox = await getOutboxRepo();
      await outbox.enqueue(
        {
          event: 'workspace.invited',
          to: normalizedEmail,
          subject: '[Supporter B] 워크스페이스 초대장',
          html,
          dedupeKey: `ws-invite:${workspaceId}:${normalizedEmail}:${bucket15Min()}`,
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
