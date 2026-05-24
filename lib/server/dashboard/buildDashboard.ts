// Pure dashboard aggregation. No DB/IO — repos are read by loadDashboard.ts.
// `now` is injected for deterministic tests (formatDeadline uses Date.now() and
// is not injectable, so we use a local now-based badge helper instead).
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import { matchesDeadlineBucket } from '@/lib/server/board/filterRfps';

export type DashboardKpi = { id: string; label: string; value: number; href: string };
export type ActionItem = { id: string; href: string; title: string; badge: string };
export type ActionGroup = { id: string; label: string; items: ActionItem[] };
export type Dashboard = { kpis: DashboardKpi[]; groups: ActionGroup[] };

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
  const sent = rfps.filter((r) => r.status === 'sent');
  const countOf = (r: RFP) => submittedCountByRfp.get(r.id) ?? 0;
  const isUrgent = (r: RFP) => matchesDeadlineBucket(r.deadline, 'd7', now);

  const kpis: DashboardKpi[] = [
    { id: 'active', label: '진행중', value: sent.length, href: '/rfp?status=active' },
    { id: 'due', label: '마감 임박', value: sent.filter(isUrgent).length, href: '/rfp?status=active&deadline=d7' },
    { id: 'review', label: '응답 검토대기', value: sent.filter((r) => countOf(r) >= 1).length, href: '/rfp?status=active' },
    { id: 'awarded', label: '계약완료', value: rfps.filter((r) => r.status === 'awarded').length, href: '/rfp?status=awarded' },
  ];

  const dueItems: ActionItem[] = [...sent]
    .filter(isUrgent)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .map((r) => ({ id: r.id, href: `/rfp/${r.code}`, title: r.title, badge: deadlineBadge(r.deadline, now) }));

  const reviewItems: ActionItem[] = sent
    .filter((r) => countOf(r) >= 1)
    .map((r) => ({ id: r.id, href: `/rfp/${r.code}`, title: r.title, badge: `응답 ${countOf(r)}건` }));

  const unansweredItems: ActionItem[] = sent
    .filter((r) => countOf(r) === 0 && r.sentAt != null && daysSince(r.sentAt, now) >= UNANSWERED_DAYS)
    .map((r) => ({ id: r.id, href: `/rfp/${r.code}`, title: r.title, badge: `응답 0건 · 발송 ${daysSince(r.sentAt!, now)}일` }));

  const groups: ActionGroup[] = [
    { id: 'due', label: '마감 임박', items: dueItems },
    { id: 'review', label: '응답 도착·검토대기', items: reviewItems },
    { id: 'unanswered', label: '무응답 경과', items: unansweredItems },
  ].filter((g) => g.items.length > 0);

  return { kpis, groups };
}
