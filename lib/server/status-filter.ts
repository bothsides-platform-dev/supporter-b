// status-filter.ts — Sidebar URL param token → domain status mapping + filter.
//
// Sidebar tokens are user-facing labels; domain enums are the actual DB values.
// RFP mapping (token → statuses it folds — 칸반 컬럼 모집단과 1:1):
//   active   → ['sent']                 (sidebar calls in-flight RFPs "active")
//   closed   → ['closed', 'cancelled']  (칸반 마감 컬럼이 둘을 폴드 — 표/딥링크도 동일 모집단)
//   awarded  → ['awarded']
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

const RFP_PARAM_MAP: Record<string, readonly RfpStatus[]> = {
  active: ['sent'],
  closed: ['closed', 'cancelled'],
  awarded: ['awarded'],
};

/** Map a sidebar URL token to the domain statuses it folds, or undefined if no match. */
export function mapRfpParam(param: string | undefined): readonly RfpStatus[] | undefined {
  if (!param) return undefined;
  return RFP_PARAM_MAP[param];
}

/** Filter RFPs by sidebar URL token. Returns all if param is absent/unknown. */
export function filterRfpsByParam(rfps: RFP[], param: string | undefined): RFP[] {
  const statuses = mapRfpParam(param);
  if (statuses === undefined) {
    // bare /rfp → all; unknown param → empty (no match)
    if (!param) return rfps;
    return [];
  }
  return rfps.filter((r) => statuses.includes(r.status));
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
