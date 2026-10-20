import { and, eq, inArray } from 'drizzle-orm';
import {
  users,
  workspaces,
  workspaceMembers,
  bizProfiles,
  verificationTokens,
  verificationApplications,
  rfps,
} from '@/lib/db/schema';
import { getGuestDraftService } from '@/lib/server/services/guest-drafts';

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
 *                   unverified user in an established NON-pending workspace —
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
 * An untouched sole-member automatically approved buyer workspace is still a
 * provisional signup until email verification; it may be replaced too.
 *
 * Otherwise it deletes the user's provisional workspace(s) — cascading
 * workspace_members / pg_profiles / verification_applications / columns — plus
 * the buyer biz_profile (not cascaded), the user row, and the email's
 * signup_email tokens. Bound guest state is retired and unbound first; only an
 * exact draft-id + secret replay stays blocked so a lost signup response can
 * recover through the existing login-and-resume path.
 *
 * Pass the surrounding `tx` so this runs atomically with the new user insert.
 */
export async function purgeUnverifiedSignup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  email: string,
  returningGuestDraft?: { id: string; secret: string },
): Promise<'clear' | 'blocked'> {
  const [u] = await tx
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .for('update');
  if (!u) return 'clear';
  if (u.emailVerified) return 'blocked';

  const memberships = await tx
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, u.id));
  const wsIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);

  let bizIds: string[] = [];
  if (wsIds.length > 0) {
    const wsRows = await tx
      .select({ id: workspaces.id, status: workspaces.status, bizProfileId: workspaces.bizProfileId })
      .from(workspaces)
      .where(inArray(workspaces.id, wsIds))
      .for('update');

    // Automatic workspace approval is not proof of mailbox ownership. Preserve
    // the abandoned-signup replacement rule only for untouched, sole-member
    // automatic approvals. Invited/shared/manually approved workspaces stay protected.
    const nonPending = wsRows.filter((w: { status: string }) => w.status !== 'pending') as {
      id: string; status: string;
    }[];
    if (nonPending.length > 0) {
      if (nonPending.some(w => w.status !== 'active')) return 'blocked';
      const activeIds = nonPending.map(w => w.id);
      const autoApproved = await tx.select({ workspaceId: verificationApplications.workspaceId })
        .from(verificationApplications)
        .innerJoin(workspaces, eq(workspaces.id, verificationApplications.workspaceId))
        .innerJoin(bizProfiles, eq(bizProfiles.id, workspaces.bizProfileId))
        .where(and(
          inArray(verificationApplications.workspaceId, activeIds),
          eq(verificationApplications.status, 'approved'),
          eq(verificationApplications.reviewedBy, 'system:bona-pay'),
          eq(workspaces.type, 'buyer'),
          eq(bizProfiles.grade, 'sole'),
          eq(bizProfiles.gradeSource, 'api_confirmed'),
        ));
      const approvedIds = new Set(autoApproved.map((row: { workspaceId: string }) => row.workspaceId));
      if (activeIds.some(id => !approvedIds.has(id))) return 'blocked';
      const members = await tx.select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers).where(inArray(workspaceMembers.workspaceId, activeIds)).for('update');
      if (activeIds.some(id => {
        const group = members.filter((m: { workspaceId: string }) => m.workspaceId === id);
        return group.length !== 1 || group[0].userId !== u.id || group[0].role !== 'admin';
      })) return 'blocked';
      const [existingRfp] = await tx.select({ id: rfps.id }).from(rfps)
        .where(inArray(rfps.buyerWsId, activeIds)).limit(1);
      if (existingRfp) return 'blocked';
    }

    bizIds = wsRows
      .map((w: { bizProfileId: string | null }) => w.bizProfileId)
      .filter((x: string | null): x is string => !!x);
  }

  const guestDraftService = await getGuestDraftService();
  if (
    returningGuestDraft &&
    (await guestDraftService.matchesBoundSignup(returningGuestDraft, u.id, tx))
  ) {
    return 'blocked';
  }

  // A guest draft is provisional content, not proof that the unverified
  // password principal owns the mailbox. Retire it before deleting the owner
  // FKs so an attacker-controlled draft cannot make those credentials durable.
  await guestDraftService.retireUser(u.id, tx);

  if (wsIds.length > 0) {
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
