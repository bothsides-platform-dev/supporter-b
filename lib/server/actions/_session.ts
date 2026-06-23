import { requireBuyerSession, requirePgSession, requireSession } from '@/lib/auth/session';

export type ActorResult =
  | { ok: true; userId: string; workspaceId: string }
  | { ok: false; error: string };

/** Resolve the caller as a buyer actor. Returns FORBIDDEN_BUYER on failure. */
export async function requireBuyerActor(): Promise<ActorResult> {
  try {
    const s = await requireBuyerSession();
    return { ok: true, userId: s.user.id, workspaceId: s.user.workspaceId };
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }
}

/** Resolve the caller as a PG actor. Returns FORBIDDEN_PG on failure. */
export async function requirePgActor(): Promise<ActorResult> {
  try {
    const s = await requirePgSession();
    return { ok: true, userId: s.user.id, workspaceId: s.user.workspaceId };
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }
}

/** Resolve any authenticated workspace member. Returns UNAUTHENTICATED or NO_WORKSPACE on failure. */
export async function requireWorkspaceActor(): Promise<ActorResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const { id, workspaceId } = session.user;
  if (!workspaceId) return { ok: false, error: 'NO_WORKSPACE' };
  return { ok: true, userId: id, workspaceId };
}
