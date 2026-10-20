'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  guestResumeTarget,
  loadGuestDraft,
  RESUME_PATH,
  sameOwner,
  type DraftOwner,
} from '@/lib/guest-rfp/draft';
export function GuestResumeRedirect({ actor, serverPending = false, hasServerDraft = false }: { actor: DraftOwner; serverPending?: boolean; hasServerDraft?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (serverPending) { router.replace(RESUME_PATH); return; }
    if (hasServerDraft) return;
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
  }, [actor.userId, actor.workspaceId, actor, router, serverPending, hasServerDraft]);
  return hasServerDraft ? <div className="px-8 pt-4"><Link className="text-[var(--md-sys-color-primary)] underline" href={RESUME_PATH}>작성하던 견적을 이어 써요</Link></div> : null;
}
