import { requireSession, requirePgSession } from '@/lib/auth/session';
import { buyerIdentity, instantDb } from './services/instant-quotes';
export async function instantViewer() {
  const s = await requireSession({ allowInactiveWorkspace: true });
  if (!s.user.workspaceId) throw Error('FORBIDDEN');
  const actor = { userId: s.user.id, workspaceId: s.user.workspaceId };
  if (s.user.workspaceType === 'pg') {
    await requirePgSession();
    return { actor, pg: true, active: true };
  }
  const who = await buyerIdentity(await instantDb(), actor);
  return { actor, pg: false, active: who.status === 'active' };
}
