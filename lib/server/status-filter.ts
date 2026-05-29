// status-filter.ts — Sidebar URL param token → domain status mapping + filter.
//
// Sidebar tokens are user-facing labels; domain enums are the actual DB values.
// RFP mapping:
//   draft    → rfp_status 'draft'
//   active   → rfp_status 'sent'   (sidebar calls in-flight RFPs "active")
//   closed   → rfp_status 'closed'
//   awarded  → rfp_status 'awarded'
//   undefined / '' / unknown → undefined (show all)
//
// Inbox mapping (invitation-level):
//   new       → invitation_status 'sent'       (kind: invStatus)
//   submitted → invitation_status 'accepted'   (kind: invStatus)
//   closed    → rfp_status 'closed'            (kind: rfpStatus — no inv enum for this)
//   undefined / '' → undefined (show all)

import type { RFP, RfpStatus } from '@/lib/types/rfp';
import type { InboxRow } from '@/components/inbox/InboxList';

// ── RFP ───────────────────────────────────────────────────────────────────

const RFP_PARAM_MAP: Record<string, RfpStatus> = {
  draft: 'draft',
  active: 'sent',
  closed: 'closed',
  awarded: 'awarded',
};

/** Map a sidebar URL token to the domain RfpStatus, or undefined if no match. */
export function mapRfpParam(param: string | undefined): RfpStatus | undefined {
  if (!param) return undefined;
  return RFP_PARAM_MAP[param];
}

/** Filter RFPs by sidebar URL token. Returns all if param is absent/unknown. */
export function filterRfpsByParam(rfps: RFP[], param: string | undefined): RFP[] {
  const domainStatus = mapRfpParam(param);
  if (domainStatus === undefined) {
    // bare /rfp → all; unknown param → empty (no match)
    if (!param) return rfps;
    return [];
  }
  return rfps.filter((r) => r.status === domainStatus);
}

// ── Inbox ─────────────────────────────────────────────────────────────────

export type InboxFilterMapped =
  | { kind: 'invStatus'; value: string }
  | { kind: 'rfpStatus'; value: string };

const INBOX_PARAM_MAP: Record<string, InboxFilterMapped> = {
  new: { kind: 'invStatus', value: 'sent' },
  submitted: { kind: 'invStatus', value: 'accepted' },
  // 'closed' has no invitation enum value; it means the parent RFP is closed.
  closed: { kind: 'rfpStatus', value: 'closed' },
};

/** Map a sidebar URL token to the domain filter descriptor, or undefined. */
export function mapInboxParam(param: string | undefined): InboxFilterMapped | undefined {
  if (!param) return undefined;
  return INBOX_PARAM_MAP[param];
}

/** Filter inbox rows by sidebar URL token. Returns all if param is absent. */
export function filterInboxRowsByParam(rows: InboxRow[], param: string | undefined): InboxRow[] {
  const mapped = mapInboxParam(param);
  if (mapped === undefined) {
    if (!param) return rows;
    return [];
  }
  if (mapped.kind === 'invStatus') {
    return rows.filter((r) => r.invitationStatus === mapped.value);
  }
  // kind === 'rfpStatus'
  return rows.filter((r) => r.rfpStatus === mapped.value);
}
