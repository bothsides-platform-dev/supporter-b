import { describe, it, expect } from 'vitest';
import {
  buildBuyerDashboard,
  buildBuyerHomeDashboard,
  countSubmittedBids,
  UNANSWERED_DAYS,
  buildPgDashboard,
} from '../buildDashboard';
import type { PgDashRow } from '../buildDashboard';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { OpportunityListing } from '@/lib/types/pg-request';
import type { BuyerAgreementStatus } from '@/lib/types/signing';

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

describe('buildBuyerHomeDashboard', () => {
  it('견적 검토를 먼저 보여주고 마감 임박·미도착 작업은 중복하지 않는다', () => {
    const result = buildBuyerHomeDashboard([
      rfp({ id: 'quoted', deadline: fromNow(2), sentAt: fromNow(-5) }),
      rfp({ id: 'due', deadline: fromNow(3), sentAt: fromNow(-5) }),
      rfp({ id: 'waiting', deadline: fromNow(20), sentAt: fromNow(-5) }),
      rfp({ id: 'expired-quote', deadline: fromNow(-1) }),
    ], new Map([['quoted', 1], ['expired-quote', 1]]), [], NOW);
    expect(result.groups.map(g => g.id)).toEqual(['review', 'due', 'unanswered']);
    expect(result.groups.flatMap(g => g.items.map(i => i.id))).toEqual(['quoted', 'expired-quote', 'due', 'waiting']);
    expect(result.groups[0].items[0]).toMatchObject({ badge: '견적 1건 · D-2', actionLabel: '견적 확인하기' });
    expect(result.groups[1].items[0].actionLabel).toBe('상담 진행 보기');
  });

  it.each([
    ['awaiting_pg_template', false, '합의서 작성하기'],
    ['awaiting_pg_template', true, '발송 결과 확인하기'],
    ['sent', true, '서명 진행 확인하기'],
    ['in_progress', true, '서명 진행 확인하기'],
    ['declined', true, '합의서 확인하기'],
    ['expired', true, '합의서 확인하기'],
    ['canceled', true, '합의서 확인하기'],
  ] satisfies [BuyerAgreementStatus['status'], boolean, string][])(
    '%s 합의서는 상태에 맞는 행동으로 연결한다 (provider=%s)', (status, hasProviderRef, actionLabel) => {
      const result = buildBuyerHomeDashboard([rfp({ id: 'awarded', code: 'P-A', status: 'awarded' })], new Map(), [
        { rfpId: 'awarded', status, hasProviderRef },
      ], NOW);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].items[0]).toMatchObject({ href: '/rfp/P-A?tab=contract', actionLabel });
    },
  );

  it('서명 완료·합의서 없는 과거 선정·다른 요청의 합의서는 할 일에 포함하지 않는다', () => {
    const result = buildBuyerHomeDashboard([
      rfp({ id: 'completed', status: 'awarded' }),
      rfp({ id: 'legacy', status: 'awarded' }),
      rfp({ id: 'closed', status: 'closed' }),
    ], new Map(), [
      { rfpId: 'completed', status: 'completed', hasProviderRef: true },
      { rfpId: 'closed', status: 'awaiting_pg_template', hasProviderRef: false },
      { rfpId: 'other', status: 'awaiting_pg_template', hasProviderRef: false },
    ], NOW);
    expect(result.groups).toEqual([]);
    expect(result.buyerTasks?.hasRequests).toBe(true);
  });

  it('실제 요청 이력으로 첫 이용을 판정한다', () => {
    expect(buildBuyerHomeDashboard([], new Map(), [], NOW).buyerTasks?.hasRequests).toBe(false);
    const closedOnly = buildBuyerHomeDashboard([rfp({ status: 'closed' })], new Map(), [], NOW);
    expect(closedOnly.kpis.every(k => k.value === 0)).toBe(true);
    expect(closedOnly.buyerTasks?.hasRequests).toBe(true);
    expect(buildBuyerDashboard([], new Map(), NOW).buyerTasks).toBeUndefined();
  });
});

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
  it('지난 마감의 sent 요청은 진행 중 작업으로 세지 않는다', () => {
    const expired = rfp({ id: 'expired', deadline: fromNow(-1), sentAt: fromNow(-5) });
    const open = rfp({ id: 'open', deadline: fromNow(1), sentAt: fromNow(-5) });
    const dashboard = buildBuyerDashboard([expired, open], new Map([['expired', 1], ['open', 0]]), NOW);
    expect(dashboard.kpis.find((k) => k.id === 'active')?.value).toBe(1);
    expect(dashboard.kpis.find((k) => k.id === 'review')?.value).toBe(1);
    expect(dashboard.groups.find((g) => g.id === 'review')?.items.map((item) => item.id)).toContain('expired');
    expect(dashboard.groups.find((g) => g.id === 'due')?.items.map((item) => item.id) ?? []).not.toContain('expired');
  });
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
    expect(byId.review.href).toBe('/rfp');
    expect(byId.awarded.value).toBe(1);
    expect(byId.awarded.href).toBe('/rfp?status=closed');
  });

  it('builds action groups, omitting empty ones', () => {
    const byId = Object.fromEntries(dash.groups.map((g) => [g.id, g]));
    expect(byId.due.items.map((i) => i.id)).toEqual(['A']);
    expect(byId.due.items[0].href).toBe('/rfp/P-A');
    expect(byId.due.items[0].badge).toBe('D-3');
    expect(byId.review.items.map((i) => i.id)).toEqual(['B']);
    expect(byId.review.items[0].badge).toBe('견적 2건');
    expect(byId.unanswered.items.map((i) => i.id)).toEqual(['A']);
    expect(byId.unanswered.items[0].badge).toBe(`견적 0건, 보낸 지 5일`);
    expect(dash.groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it('exposes the tunable unanswered threshold', () => {
    expect(UNANSWERED_DAYS).toBe(3);
  });
});

describe('buildPgDashboard', () => {
  // stage 기반(classifyPgInvitation) — KPI/그룹이 /inbox?status= 탭과 일치해야 함.
  const row = (over: Partial<PgDashRow>): PgDashRow => ({
    invitationId: 'i', stage: 'received', rfpCode: 'P-0', rfpTitle: 't', rfpDeadline: fromNow(20),
    ...over,
  });
  const rows: PgDashRow[] = [
    row({ invitationId: 'n', stage: 'received', rfpCode: 'P-N', rfpTitle: 'N', rfpDeadline: fromNow(3) }),
    row({ invitationId: 'o', stage: 'received', rfpCode: 'P-O', rfpTitle: 'O', rfpDeadline: fromNow(20) }),
    row({ invitationId: 'a', stage: 'submitted', rfpCode: 'P-A', rfpTitle: 'A', rfpDeadline: fromNow(20) }),
    row({ invitationId: 'o2', stage: 'received', rfpCode: 'P-O2', rfpTitle: 'O2', rfpDeadline: fromNow(2) }),
    row({ invitationId: 'x', stage: 'received', rfpCode: 'P-X', rfpTitle: 'X', rfpDeadline: fromNow(-1) }),
  ];
  const dash = buildPgDashboard(rows, NOW);

  it('computes PG KPI values and deep links (stage 기반)', () => {
    const byId = Object.fromEntries(dash.kpis.map((k) => [k.id, k]));
    // new = received 전부(열람 여부 무관) — /inbox?status=new 탭과 동일
    expect(byId.response.value).toBe(3);
    expect(byId.response.href).toBe('/inbox?status=response');
    // due = received & 마감 임박(d7): n(3d), o2(2d)
    expect(byId.due.value).toBe(2);
    expect(byId.drafting).toBeUndefined();
    // submitted = bid 제출(stage submitted)
    expect(byId.submitted.value).toBe(1);
  });

  it('builds PG action groups (href uses rfp code), omitting empty', () => {
    const byId = Object.fromEntries(dash.groups.map((g) => [g.id, g]));
    expect(byId.response.items.map((i) => i.id)).toEqual(['o2', 'n', 'o']);
    expect(byId.response.items[0].href).toBe('/inbox/P-O2?tab=write');
    expect(byId.due).toBeUndefined();
    expect(byId.drafting).toBeUndefined();
  });
});

describe('buildPgDashboard — open RFP discovery', () => {
  const base = {
    deadline: fromNow(5),
    requiredPaymentMethods: [] as string[],
    customPaymentMethodLabels: [] as string[],
    mainProducts: null,
  };
  const listings: OpportunityListing[] = [
    { rfpCode: 'P-OPEN1', buyerName: '구매사A', title: '오픈 견적', websiteUrl: 'https://a.example.com', ...base },
    { rfpCode: 'P-OPEN2', buyerName: '구매사B', title: '오픈 견적2', websiteUrl: null, ...base },
  ];

  it('passes through the open-RFP listings for PG discovery', () => {
    const dash = buildPgDashboard([], NOW, listings);
    expect(dash.openRfps).toEqual(listings);
  });

  it('defaults to an empty list when none are provided', () => {
    const dash = buildPgDashboard([], NOW);
    expect(dash.openRfps).toEqual([]);
  });
});

describe('buildBuyerDashboard — no open RFP discovery', () => {
  it('never surfaces open-RFP listings to buyers', () => {
    const dash = buildBuyerDashboard([], new Map(), NOW);
    expect(dash.openRfps).toBeUndefined();
  });
});

it('PG 홈의 수정 요청도 유효 마감순으로 한 번만 표시하고 종결 상담을 제외한다', () => {
  const base: PgDashRow = { invitationId: 'new', rfpCode: 'P-1', rfpTitle: '견적', stage: 'received', rfpDeadline: fromNow(3) };
  const result = buildPgDashboard([
    base,
    { ...base, invitationId: 'requote', rfpCode: 'P-2', stage: 'submitted', hasPendingRequote: true, rfpDeadline: fromNow(1) },
    { ...base, invitationId: 'rejected', reviewStatus: 'rejected' },
    { ...base, invitationId: 'ended', reviewStatus: 'buyer_ended' },
  ], NOW);
  expect(result.kpis.find(k => k.id === 'response')?.value).toBe(2);
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].items.map(i => i.id)).toEqual(['requote', 'new']);
  expect(result.groups[0].items[0]).toMatchObject({ href: '/inbox/P-2?tab=write', actionLabel: '견적 수정' });
});
