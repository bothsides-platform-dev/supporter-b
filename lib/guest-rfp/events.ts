import type { GuestDraft } from './draft';
import type { PublicIndustry } from '@/lib/types/pg-recommendation';
export function sendGuestEvent(
  draft: GuestDraft,
  event: 'started' | 'completed',
  groups: PublicIndustry[],
) {
  const d = draft.data;
  const industry =
    d.industryMode === 'custom'
      ? d.customIndustryName
      : groups.find((g) => g.id === d.industryGroupId)?.name;
  // No raw draft spread: this is the entire public telemetry contract.
  void fetch('/api/guest-rfp/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      draftId: draft.id,
      event,
      website: d.websiteUrl,
      ...(industry ? { industry } : {}),
      ...(d.title ? { title: d.title } : {}),
      ...(d.contractType ? { contractType: d.contractType } : {}),
      attachmentCount: draft.files.length,
    }),
  }).catch(() => {});
}
