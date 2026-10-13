/** Server-only business HTTP gates. Routes retain their own response format and resource ACL. */
import type { Session } from 'next-auth';
import { isEmailUnverified, isSessionRevoked, type AuthedSession } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { isWorkspaceInactive } from '@/lib/auth/workspace-status';

type BusinessApiAccess =
  | { ok: true; session: AuthedSession }
  | { ok: false; status: 401 | 403 };

/** Also used after connection-token's account-state cache; workspace access is always live. */
export async function checkBusinessWorkspace(session: Session | null): Promise<BusinessApiAccess> {
  if (!session?.user?.id) return { ok: false, status: 401 };
  if (await isWorkspaceInactive(session) || await isPgMembershipBlocked(session)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, session: session as AuthedSession };
}

export async function checkBusinessApiSession(session: Session | null): Promise<BusinessApiAccess> {
  if (!session?.user?.id || await isSessionRevoked(session)) return { ok: false, status: 401 };
  if (await isEmailUnverified(session)) return { ok: false, status: 403 };
  return checkBusinessWorkspace(session);
}
