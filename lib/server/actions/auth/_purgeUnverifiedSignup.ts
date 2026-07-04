import { and, eq, inArray } from 'drizzle-orm';
import {
  users,
  workspaces,
  workspaceMembers,
  bizProfiles,
  verificationTokens,
  rfps,
} from '@/lib/db/schema';

/**
 * Re-registration support (결정 #2): when a signup is submitted for an email
 * that already maps to an *unverified* user (an abandoned earlier attempt),
 * clear the way so the fresh signup can proceed (overwrite + resend).
 *
 * Best-effort + conservative — it purges ONLY a pure abandoned signup, and
 * returns a status the caller MUST act on BEFORE inserting the new user:
 *   - `'clear'`   → no existing user, or an abandoned signup was just purged.
 *                   Safe to INSERT the fresh user.
 *   - `'blocked'` → an email-taken account remains (a *verified* user, or an
 *                   unverified user who belongs to any NON-pending workspace —
 *                   e.g. an invitee who joined an active workspace, who is also
 *                   `emailVerified=false` per 결정 #3). The caller must return
 *                   EMAIL_TAKEN *without* attempting the INSERT.
 *
 * Why the caller must pre-check on `'blocked'` instead of catching the
 * `users_email_unique` violation inside the transaction: postgres-js records
 * every in-transaction query error and re-throws it AFTER the callback resolves
 * (`scope()`: `if (uncaughtError) throw uncaughtError`), so a try/catch around
 * the INSERT cannot swallow it — the whole tx rejects and the action crashes
 * (pglite, used in tests, lacks this re-throw, which hid the bug). Deciding
 * EMAIL_TAKEN from this SELECT keeps the tx unpoisoned in the common case.
 *
 * Otherwise it deletes the user's pending workspace(s) — cascading
 * workspace_members / pg_profiles / verification_applications / columns — plus
 * the buyer biz_profile (not cascaded), the user row, and the email's
 * signup_email tokens.
 *
 * Pass the surrounding `tx` so this runs atomically with the new user insert.
 */
export async function purgeUnverifiedSignup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  email: string,
): Promise<'clear' | 'blocked'> {
  const [u] = await tx
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!u) return 'clear';
  if (u.emailVerified) return 'blocked';

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
    if (wsRows.some((w: { status: string }) => w.status !== 'pending')) return 'blocked';

    const bizIds = wsRows
      .map((w: { bizProfileId: string | null }) => w.bizProfileId)
      .filter((x: string | null): x is string => !!x);

    // 이 워크스페이스가 소유한 RFP를 삭제 — rfps.buyer_ws_id FK는 cascade가 아니라
    // 워크스페이스 삭제 전에 비워야 한다. rfps 삭제는 bids·invitations·allowlist로 cascade.
    await tx.delete(rfps).where(inArray(rfps.buyerWsId, wsIds));
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
  return 'clear';
}
