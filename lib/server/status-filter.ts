// status-filter.ts — Sidebar URL param token → domain status mapping + filter.
//
// Sidebar tokens are user-facing labels; domain enums are the actual DB values.
// RFP mapping:
//   active   → rfp_status 'sent'   (sidebar calls in-flight RFPs "active")
//   closed   → rfp_status 'closed'
//   awarded  → rfp_status 'awarded'
//   undefined / '' / unknown → undefined (show all)
//   (draft RFPs are hidden from the kanban; surfaced only in the unfiltered table)
//
// Inbox mapping (bid-aware PG kanban stage — classifyPgInvitation, NOT invitation status):
//   new       → ['received']     (bid 없음/draft — 열람 여부 무관)
//   submitted → ['submitted']    (bid 제출됨)
//   closed    → ['won','lost']   (결과 — 선정/미선정 통합)
//   undefined / '' → undefined (show all); unknown → empty
//   ⚠️ 과거엔 invitation status('sent'/'accepted')로 필터해 열람 즉시 'opened'로
//      바뀐 건이 어떤 탭에도 안 잡히는 버그가 있었다. stage 기반으로 바로잡음.

import type { RFP, RfpStatus } from '@/lib/types/rfp';
import type { InboxRow } from '@/components/inbox/InboxList';
import type { PgKanbanStage } from '@/lib/server/pg-kanban';

// ── RFP ───────────────────────────────────────────────────────────────────

const RFP_PARAM_MAP: Record<string, RfpStatus> = {
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

// Sidebar token → the PG kanban stages it surfaces. 'closed' folds won+lost.
const INBOX_PARAM_TO_STAGES: Record<string, readonly PgKanbanStage[]> = {
  new: ['received'],
  submitted: ['submitted'],
  closed: ['won', 'lost'],
};

/** Map a sidebar URL token to the PG kanban stages it covers, or undefined. */
export function mapInboxParam(param: string | undefined): readonly PgKanbanStage[] | undefined {
  if (!param) return undefined;
  return INBOX_PARAM_TO_STAGES[param];
}

/** Filter inbox rows by sidebar URL token. Returns all if param is absent. */
export function filterInboxRowsByParam(rows: InboxRow[], param: string | undefined): InboxRow[] {
  const stages = mapInboxParam(param);
  if (stages === undefined) {
    if (!param) return rows;
    return [];
  }
  return rows.filter((r) => stages.includes(r.stage));
}
