'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  guestResumeTarget,
  loadGuestDraft,
  RESUME_PATH,
  sameOwner,
  type DraftOwner,
} from '@/lib/guest-rfp/draft';
export function GuestResumeRedirect({ actor }: { actor: DraftOwner }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const draft = loadGuestDraft();
      if (
        draft &&
        (!draft.owner || sameOwner(draft.owner, actor)) &&
        guestResumeTarget() === RESUME_PATH
      )
        router.replace(RESUME_PATH);
    } catch {
      /* The resume screen reports unreadable local storage; home remains usable. */
    }
  }, [actor.userId, actor.workspaceId, actor, router]);
  return null;
}
