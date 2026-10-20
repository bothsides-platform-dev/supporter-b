import { captureGuestClarity, type ClaritySession } from './clarity';
import type { GuestDraft } from './draft';
import type { PublicIndustry } from '@/lib/types/pg-recommendation';
import { guestJourney } from './journey-client';
export async function sendGuestEvent(
  draft: GuestDraft,
  event: 'started' | 'completed',
  groups: PublicIndustry[],
) {
  if (process.env.NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED === 'true') {
    if (event === 'started' && await guestJourney.start(draft.id, draft.files.length)) {
      void captureGuestClarity(draft.id, event);
      return;
    }
    if (event === 'completed' && guestJourney.selected()?.draftId === draft.id) {
      void captureGuestClarity(draft.id, event);
      void guestJourney.flush();
      return;
    }
  }
  const d = draft.data;
  const industry =
    d.industryMode === 'custom'
      ? d.customIndustryName
      : groups.find((g) => g.id === d.industryGroupId)?.name;
  // Snapshot only the allowed summary, never the raw draft.
  const payload = {
    draftId: draft.id,
    event,
    ...(event === 'completed' ? { website: d.websiteUrl } : {}),
    ...(industry ? { industry } : {}),
    ...(d.title ? { title: d.title } : {}),
    ...(d.contractType ? { contractType: d.contractType } : {}),
    attachmentCount: draft.files.length,
  };
  let sent = false;
  const browser = typeof window === 'undefined' ? undefined : window;
  const onPageHide = () => { void send(); };
  const send = (clarity?: ClaritySession) => {
    if (sent) return;
    sent = true;
    browser?.removeEventListener('pagehide', onPageHide);
    return fetch('/api/guest-rfp/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ...payload, ...(clarity ? { clarity } : {}) }),
    }).catch(() => {});
  };
  // keepalive only protects requests that have started. Flush synchronously
  // when leaving even if the Clarity bootstrap queue has not been processed.
  browser?.addEventListener('pagehide', onPageHide, { once: true });
  const clarity = await captureGuestClarity(draft.id, event);
  await send(clarity);
}
