import { and, eq, inArray } from 'drizzle-orm';
import {
  users,
  workspaces,
  workspaceMembers,
  bizProfiles,
  verificationTokens,
} from '@/lib/db/schema';

/**
 * Re-registration support (결정 #2): when a signup is submitted for an email
 * that already maps to an *unverified* user (an abandoned earlier attempt),
 * clear the way so the fresh signup can proceed (overwrite + resend).
 *
 * Best-effort + conservative — it purges ONLY a pure abandoned signup:
 *   - no user / a *verified* user  → no-op (the action's UNIQUE-violation path
 *     then surfaces EMAIL_TAKEN → login).
 *   - the user belongs to any NON-pending workspace (e.g. an invitee who joined
 *     an active workspace, who is also `emailVerified=false` per 결정 #3)
 *     → no-op, to never delete real workspace data.
 *
 * Otherwise it deletes the user's pending workspace(s) — cascading
 * workspace_members / pg_profiles / verification_applications / columns — plus
 * the buyer biz_profile (not cascaded), the user row, and the email's
 * signup_email tokens.
 *
 * Pass the surrounding `tx` so this runs atomically with the new user insert.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function purgeUnverifiedSignup(tx: any, email: string): Promise<void> {
  const [u] = await tx
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!u || u.emailVerified) return;

  const memberships = await tx
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, u.id));
  const wsIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);

  if (wsIds.length > 0) {
    const wsRows = await tx
      .select({ id: workspaces.id, status: workspaces.status, bizProfileId: workspaces.bizProfileId })
      .from(workspaces)
      .where(inArray(workspaces.id, wsIds));

    // Guard: any non-pending membership ⟹ not a pure abandoned signup. Refuse.
    if (wsRows.some((w: { status: string }) => w.status !== 'pending')) return;

    const bizIds = wsRows
      .map((w: { bizProfileId: string | null }) => w.bizProfileId)
      .filter((x: string | null): x is string => !!x);

    await tx.delete(workspaces).where(inArray(workspaces.id, wsIds));
    if (bizIds.length > 0) {
      await tx.delete(bizProfiles).where(inArray(bizProfiles.id, bizIds));
    }
  }

  await tx.delete(users).where(eq(users.id, u.id));
  await tx
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.email, email),
        eq(verificationTokens.purpose, 'signup_email'),
      ),
    );
}
