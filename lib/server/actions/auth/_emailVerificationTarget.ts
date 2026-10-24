import type { Session } from 'next-auth';
import { getGuestDraftService } from '@/lib/server/services/guest-drafts';

export async function emailVerificationTarget(session: Session): Promise<string | undefined> {
  const { id, workspaceId, workspaceType } = session.user;
  if (!id || !workspaceId || workspaceType !== 'buyer') return undefined;
  const drafts = await (await getGuestDraftService()).listOwned({ userId: id, workspaceId });
  return drafts.some(draft => draft.resumePending) ? '/rfp-create?resume=guest' : undefined;
}
