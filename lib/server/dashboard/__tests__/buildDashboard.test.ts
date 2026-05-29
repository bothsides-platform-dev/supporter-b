import { describe, it, expect } from 'vitest';
import {
  buildBuyerDashboard,
  countSubmittedBids,
  UNANSWERED_DAYS,
  buildPgDashboard,
} from '../buildDashboard';
import type { PgDashRow } from '../buildDashboard';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

const NOW = new Date(2026, 4, 25, 9, 0, 0); // 2026-05-25 09:00 local
const DAY = 86_400_000;
const fromNow = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

const rfp = (over: Partial<RFP>): RFP => ({
  id: 'id', code: 'P-2605-0000', buyerWsId: 'ws', title: '제목',
  memo: '', rfpFiles: [], allowedPgWorkspaceIds: [],
  deadline: fromNow(20), status: 'sent', createdBy: 'u', createdAt: fromNow(-30),
  ...over,
} as RFP);

const bid = (status: Bid['status']): Bid => ({ status } as Bid);

describe('countSubmittedBids', () => {
  it('counts only submitted bids per rfp (draft/withdrawn excluded)', () => {
    const map = new Map<string, Bid[]>([
      ['a', [bid('submitted'), bid('draft'), bid('submitted')]],
      ['b', [bid('draft'), bid('withdrawn')]],
    ]);
    const out = countSubmittedBids(map);
    expect(out.get('a')).toBe(2);
    expect(out.get('b')).toBe(0);
  });
});

describe('buildBuyerDashboard', () => {
  const rfps: RFP[] = [
    rfp({ id: 'A', code: 'P-A', title: 'A', status: 'sent', deadline: fromNow(3), sentAt: fromNow(-5) }),
    rfp({ id: 'B', code: 'P-B', title: 'B', status: 'sent', deadline: fromNow(20), sentAt: fromNow(-10) }),
    rfp({ id: 'C', code: 'P-C', title: 'C', status: 'awarded', deadline: fromNow(-1) }),
    rfp({ id: 'D', code: 'P-D', title: 'D', status: 'draft', deadline: fromNow(20) }),
    rfp({ id: 'E', code: 'P-E', title: 'E', status: 'sent', deadline: fromNow(20), sentAt: fromNow(-1) }),
  ];
  const counts = new Map<string, number>([['A', 0], ['B', 2], ['E', 0]]);
  const dash = buildBuyerDashboard(rfps, counts, NOW);

  it('computes KPI values and deep links', () => {
    const byId = Object.fromEntries(dash.kpis.map((k) => [k.id, k]));
    expect(byId.active.value).toBe(3);
    expect(byId.active.href).toBe('/rfp?status=active');
    expect(byId.due.value).toBe(1);
    expect(byId.due.href).toBe('/rfp?status=active&deadline=d7');
    expect(byId.review.value).toBe(1);
    expect(byId.awarded.value).toBe(1);
    expect(byId.awarded.href).toBe('/rfp?status=awarded');
  });

  it('builds action groups, omitting empty ones', () => {
    const byId = Object.fromEntries(dash.groups.map((g) => [g.id, g]));
    expect(byId.due.items.map((i) => i.id)).toEqual(['A']);
    expect(byId.due.items[0].href).toBe('/rfp/P-A');
    expect(byId.due.items[0].badge).toBe('D-3');
    expect(byId.review.items.map((i) => i.id)).toEqual(['B']);
    expect(byId.review.items[0].badge).toBe('응답 2건');
    expect(byId.unanswered.items.map((i) => i.id)).toEqual(['A']);
    expect(byId.unanswered.items[0].badge).toBe(`응답 0건 · 발송 5일`);
    expect(dash.groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it('exposes the tunable unanswered threshold', () => {
    expect(UNANSWERED_DAYS).toBe(3);
  });
});

describe('buildPgDashboard', () => {
  const row = (over: Partial<PgDashRow>): PgDashRow => ({
    invitationId: 'i', invitationStatus: 'sent', rfpCode: 'P-0', rfpTitle: 't', rfpDeadline: fromNow(20),
    ...over,
  });
  const rows: PgDashRow[] = [
    row({ invitationId: 'n', invitationStatus: 'sent', rfpCode: 'P-N', rfpTitle: 'N', rfpDeadline: fromNow(3) }),
    row({ invitationId: 'o', invitationStatus: 'opened', rfpCode: 'P-O', rfpTitle: 'O', rfpDeadline: fromNow(20) }),
    row({ invitationId: 'a', invitationStatus: 'accepted', rfpCode: 'P-A', rfpTitle: 'A', rfpDeadline: fromNow(20) }),
    row({ invitationId: 'o2', invitationStatus: 'opened', rfpCode: 'P-O2', rfpTitle: 'O2', rfpDeadline: fromNow(2) }),
  ];
  const dash = buildPgDashboard(rows, NOW);

  it('computes PG KPI values and deep links', () => {
    const byId = Object.fromEntries(dash.kpis.map((k) => [k.id, k]));
    expect(byId.new.value).toBe(1);
    expect(byId.new.href).toBe('/inbox?status=new');
    expect(byId.due.value).toBe(2);
    expect(byId.drafting).toBeUndefined();
    expect(byId.submitted.value).toBe(1);
  });

  it('builds PG action groups (href uses rfp code), omitting empty', () => {
    const byId = Object.fromEntries(dash.groups.map((g) => [g.id, g]));
    expect(byId.new.items.map((i) => i.id)).toEqual(['n']);
    expect(byId.new.items[0].href).toBe('/inbox/P-N');
    expect(byId.due.items.map((i) => i.id)).toEqual(['o2', 'n']);
    expect(byId.drafting).toBeUndefined();
  });
});
