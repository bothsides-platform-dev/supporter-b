// Pure dashboard aggregation. No DB/IO — repos are read by loadDashboard.ts.
// `now` is injected for deterministic tests (formatDeadline uses Date.now() and
// is not injectable, so we use a local now-based badge helper instead).
import { pgRequestState, type PgRequestStateInput } from '@/lib/rfp/pg-request-state';
import { pgDealRoomLink } from '@/lib/rfp/pg-deal-room-link';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { OpportunityListing } from '@/lib/types/pg-request';
import { matchesDeadlineBucket } from '@/lib/server/board/filterRfps';
import { isRfpBidWindowOpen } from '@/lib/rfp/bid-window';

export type DashboardKpi = { id: string; label: string; value: number; href: string };
export type ActionItem = { id: string; href: string; title: string; badge: string; actionLabel?: string };
export type ActionGroup = { id: string; label: string; items: ActionItem[] };
export type Dashboard = {
  requests?: import('@/components/inbox/InboxList').InboxRow[];
  kpis: DashboardKpi[];
  groups: ActionGroup[];
  // PG 게시판 탐색 목록 (오픈 RFP). buyer dashboard 에는 없음.
  openRfps?: OpportunityListing[];
};

const DAY = 86_400_000;
/** "무응답 경과" 기준일 — 시작값, 튜닝 가능. */
export const UNANSWERED_DAYS = 3;

/** buyer-visible 응답 수 = submitted bid 수(rfp별). draft/withdrawn 제외. */
export function countSubmittedBids(bidsByRfp: Map<string, Bid[]>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [rfpId, bids] of bidsByRfp) {
    m.set(rfpId, bids.filter((b) => b.status === 'submitted').length);
  }
  return m;
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

/** now 주입형 마감 뱃지 — 'D-n' 또는 '마감'(지남). */
function deadlineBadge(deadline: string, now: Date): string {
  const diff = Math.ceil((new Date(deadline).getTime() - now.getTime()) / DAY);
  return diff < 0 ? '마감' : `D-${diff}`;
}

export function buildBuyerDashboard(
  rfps: RFP[],
  submittedCountByRfp: Map<string, number>,
  now: Date,
): Dashboard {
  const sent = rfps.filter((r) => isRfpBidWindowOpen(r, now.getTime()));
  const countOf = (r: RFP) => submittedCountByRfp.get(r.id) ?? 0;
  const reviewable = rfps.filter((r) => r.status === 'sent' && countOf(r) >= 1);
  const isUrgent = (r: RFP) => matchesDeadlineBucket(r.deadline, 'd7', now);

  const kpis: DashboardKpi[] = [
    { id: 'active', label: '진행중', value: sent.length, href: '/rfp?status=active' },
    { id: 'due', label: '마감 임박', value: sent.filter(isUrgent).length, href: '/rfp?status=active&deadline=d7' },
    { id: 'review', label: '견적 검토대기', value: reviewable.length, href: '/rfp' },
    { id: 'awarded', label: '선정 완료', value: rfps.filter((r) => r.status === 'awarded').length, href: '/rfp?status=closed' },
  ];

  const dueItems: ActionItem[] = [...sent]
    .filter(isUrgent)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .map((r) => ({ id: r.id, href: `/rfp/${r.code}`, title: r.title, badge: deadlineBadge(r.deadline, now) }));

  const reviewItems: ActionItem[] = reviewable
    .map((r) => ({ id: r.id, href: `/rfp/${r.code}`, title: r.title, badge: `견적 ${countOf(r)}건` }));

  const unansweredItems: ActionItem[] = sent
    .filter((r) => countOf(r) === 0 && r.sentAt != null && daysSince(r.sentAt, now) >= UNANSWERED_DAYS)
    .map((r) => ({ id: r.id, href: `/rfp/${r.code}`, title: r.title, badge: `견적 0건, 보낸 지 ${daysSince(r.sentAt!, now)}일` }));

  const groups: ActionGroup[] = [
    { id: 'due', label: '마감 임박', items: dueItems },
    { id: 'review', label: '견적 도착, 검토 대기', items: reviewItems },
    { id: 'unanswered', label: '견적 미도착', items: unansweredItems },
  ].filter((g) => g.items.length > 0);

  return { kpis, groups };
}

export type PgDashRow = PgRequestStateInput & {
  invitationId: string;
  rfpCode: string;
  rfpTitle: string;
  buyerName?: string;
};

export function buildPgDashboard(
  rows: PgDashRow[],
  now: Date,
  openRfps: OpportunityListing[] = [],
): Dashboard {
  const response = rows.filter(r => pgRequestState(r, now.getTime()).needsResponse)
    .sort((a, b) => Date.parse(a.rfpDeadline) - Date.parse(b.rfpDeadline));
  const kpis: DashboardKpi[] = [
    { id: 'response', label: '응답 필요', value: response.length, href: '/inbox?status=response' },
    { id: 'due', label: '마감 임박', value: response.filter(r => matchesDeadlineBucket(r.rfpDeadline, 'd7', now)).length, href: '/inbox?status=response&deadline=d7' },
    { id: 'submitted', label: '보낸 견적', value: rows.filter(r => r.stage === 'submitted' && pgRequestState(r, now.getTime()).label === '견적 보냄').length, href: '/inbox?status=submitted' },
  ];
  const items = response.map(r => ({
    id: r.invitationId, href: pgDealRoomLink(r.rfpCode, 'write'),
    title: r.buyerName ? `${r.buyerName} · ${r.rfpTitle}` : r.rfpTitle,
    badge: deadlineBadge(r.rfpDeadline, now), actionLabel: pgRequestState(r, now.getTime()).actionLabel,
  }));
  return { kpis, groups: items.length ? [{ id: 'response', label: '응답이 필요한 요청', items }] : [], openRfps };
}
