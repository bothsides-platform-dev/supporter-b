'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { requireSession } from '@/lib/auth/session';
import { unstable_update } from '@/auth';
import { getMembership } from '@/lib/auth/active-workspace';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
import { getUserRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { actionDb } from '../auth/_shared';
import { appOrigins, workspaceSwitchTarget } from '@/lib/site-routing';
import { logger } from '@/lib/observability/logger';

export type SwitchWorkspaceResult =
  | { ok: true; redirectTo: string }
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
 *
 * ⚠️ CALLER CONTRACT — HARD NAVIGATION REQUIRED. This action calls
 * `revalidatePath('/home')` and returns `redirectTo`. The caller MUST perform a
 * HARD navigation (`window.location.assign(redirectTo)`), NOT a soft
 * `router.push` / `router.refresh()`. The nav chrome (Sidebar + Header) lives in
 * the shared (app) layout above the route slot, so a soft refresh both leaves
 * stale chrome AND `revalidatePath` + `router.refresh()` deadlocks under Next 16
 * (issue #86055). Do not "clean up" by switching the caller to router.refresh().
 * See components/shell/WorkspaceSwitcher.tsx.
 */
export async function switchWorkspaceAction(
  targetWorkspaceId: string,
  landingPath: string = '/home',
): Promise<SwitchWorkspaceResult> {
  const session = await requireSession().catch(() => null);
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHENTICATED' };

  if (!targetWorkspaceId || typeof targetWorkspaceId !== 'string') {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  const db = actionDb();
  const workspaceRepo = await getWorkspaceRepo();
  const userRepo = await getUserRepo();

  // Master/operator: re-confirm against the server-only MASTER_ACCOUNT_EMAILS
  // allowlist (the session email is signed, so this can't be forged), then bypass
  // membership and land in any ACTIVE workspace as a synthetic admin.
  if (isMasterEmail(session.user.email)) {
    const ws = await workspaceRepo.findActiveById(targetWorkspaceId);
    if (!ws) return { ok: false, error: 'INVALID_INPUT' };

    await userRepo.setLastActiveWorkspace(session.user.id, targetWorkspaceId);

    await unstable_update({
      user: { workspaceId: targetWorkspaceId, workspaceType: ws.type, role: 'admin' },
    });

    logger.info('master account accessed workspace', {
      event: 'master_workspace_access',
      masterUserId: session.user.id,
      targetWorkspaceId,
    });

    const masterHost = (await headers()).get('host');
    const masterRedirect = workspaceSwitchTarget(ws.type, masterHost, appOrigins(), landingPath);
    revalidatePath('/home');
    return { ok: true, redirectTo: masterRedirect };
  }

  const membership = await getMembership(db, session.user.id, targetWorkspaceId);
  if (!membership) return { ok: false, error: 'NOT_MEMBER' };

  await userRepo.setLastActiveWorkspace(session.user.id, membership.workspaceId);

  await unstable_update({
    user: {
      workspaceId: membership.workspaceId,
      workspaceType: membership.workspaceType,
      role: membership.role,
    },
  });

  // Cross-type switch lands on the other host (absolute); same-type stays relative.
  // The switcher hard-navigates to redirectTo, so an absolute URL crosses origins
  // while keeping the (already domain-scoped) session cookie. See WorkspaceSwitcher.
  const host = (await headers()).get('host');
  const redirectTo = workspaceSwitchTarget(membership.workspaceType, host, appOrigins(), landingPath);
  revalidatePath('/home');
  return { ok: true, redirectTo };
}
