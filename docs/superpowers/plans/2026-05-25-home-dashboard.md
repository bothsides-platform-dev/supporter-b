# 홈 2단 대시보드 (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/home`을 칸반 보드에서 **2단 대시보드**(좌: 클릭형 KPI + "지금 처리할 일" 액션큐 / 우: 채팅 placeholder)로 재설계한다 — buyer·PG 대칭.

**Architecture:** 서버 순수 함수(`buildBuyerDashboard`/`buildPgDashboard`)가 RFP·응답 수 / inbox 행에서 KPI와 액션 그룹을 집계한다. 얇은 로더(`loadBuyerDashboard`/`loadPgDashboard`)가 기존 repo(`findByBuyerWs` + `findByRfpIds`, `findByPgWorkspace`)로 데이터를 모아 순수 함수에 넘긴다. 표현 컴포넌트(`KpiStrip`·`ActionQueue`·`ChatPanelPlaceholder`·`HomeDashboard`)는 props만 렌더. `BuyerHome`/`PgHome`가 보드 대신 대시보드를 조립한다.

**Tech Stack:** Next.js 16 App Router(async server components), React 19, TypeScript strict, Vitest(`unit-node` 순수함수 / `unit-jsdom` 컴포넌트), Testing Library, Tailwind v4 + `--md-sys-*` 토큰.

**선행 사실 (코드 검증됨, main 기준):**
- `getRfpRepo().findByBuyerWs(wsId)` → `RFP[]` (`.id` uuid, `.code`, `.status`, `.deadline`, `.sentAt?`, `.title`).
- `getBidRepo().findByRfpIds(rfpIds: string[])` → `Map<rfpId, Bid[]>` (배치, N+1 제거). `Bid.status: 'draft'|'submitted'|'withdrawn'`. **buyer-visible 응답 = `submitted`만** (PG draft bid은 buyer에 안 보임).
- `getInvitationRepo().findByPgWorkspace(wsId)` → `{ invitation, rfp }[]`. `invitation.status` ∈ `sent|opened|accepted|...`, `invitation.id` uuid; `rfp.code`/`.title`/`.deadline`.
- `matchesDeadlineBucket(deadline, 'd7', now)` (Plan 1, `@/lib/server/board/filterRfps`) = `today ≤ deadline ≤ today+7d` (overdue 제외) → "마감 임박" 판정에 재사용.
- `formatDeadline`은 내부에서 `Date.now()`를 써 주입 불가 → **테스트 결정성**을 위해 본 모듈은 `now` 주입형 `deadlineBadge(deadline, now)`를 따로 둔다.
- `EmptyState({ icon?, title, description? })`, `PageEnter({ children, className })`, `Skeleton`, 아이콘 `EnvelopeIcon`/`CheckIcon`/`FileTextIcon`/`InboxIcon` 모두 존재.
- 도메인 가드(PG_RFP_SPEC): 경쟁사 정보(competitorCount 등) 0, 결재선 0.

**범위 밖 (YAGNI):** 채팅 기능/백엔드(placeholder만), RFP/Inbox 보드·상세(Plan 1 완료), 알림.

---

## Task 1: 순수 `buildBuyerDashboard` + 타입 + `countSubmittedBids`

**Files:**
- Create: `lib/server/dashboard/buildDashboard.ts`
- Test: `lib/server/dashboard/__tests__/buildDashboard.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/server/dashboard/__tests__/buildDashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildBuyerDashboard,
  countSubmittedBids,
  UNANSWERED_DAYS,
} from '../buildDashboard';
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
  // A: sent, due in 3d, 0 responses, sent 5d ago  → 마감임박 + 무응답경과
  // B: sent, due in 20d, 2 responses             → 응답검토대기
  // C: awarded                                    → 계약완료 only
  // D: draft                                      → none
  // E: sent, due 20d, 0 responses, sent 1d ago    → 진행중만 (no group)
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
    expect(byId.active.value).toBe(3); // A, B, E
    expect(byId.active.href).toBe('/rfp?status=active');
    expect(byId.due.value).toBe(1); // A
    expect(byId.due.href).toBe('/rfp?status=active&deadline=d7');
    expect(byId.review.value).toBe(1); // B
    expect(byId.awarded.value).toBe(1); // C
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
    // E qualifies for no group (1 day < UNANSWERED_DAYS), C/D not sent
    expect(dash.groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it('exposes the tunable unanswered threshold', () => {
    expect(UNANSWERED_DAYS).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/dashboard/__tests__/buildDashboard.test.ts`
Expected: FAIL — `Failed to resolve import "../buildDashboard"`.

- [ ] **Step 3: Write minimal implementation**

`lib/server/dashboard/buildDashboard.ts`:

```ts
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
    .map((r) => ({ id: r.code, href: `/rfp/${r.code}`, title: r.title, badge: deadlineBadge(r.deadline, now) }));

  const reviewItems: ActionItem[] = sent
    .filter((r) => countOf(r) >= 1)
    .map((r) => ({ id: r.code, href: `/rfp/${r.code}`, title: r.title, badge: `응답 ${countOf(r)}건` }));

  const unansweredItems: ActionItem[] = sent
    .filter((r) => countOf(r) === 0 && r.sentAt != null && daysSince(r.sentAt, now) >= UNANSWERED_DAYS)
    .map((r) => ({ id: r.code, href: `/rfp/${r.code}`, title: r.title, badge: `응답 0건 · 발송 ${daysSince(r.sentAt!, now)}일` }));

  const groups: ActionGroup[] = [
    { id: 'due', label: '마감 임박', items: dueItems },
    { id: 'review', label: '응답 도착·검토대기', items: reviewItems },
    { id: 'unanswered', label: '무응답 경과', items: unansweredItems },
  ].filter((g) => g.items.length > 0);

  return { kpis, groups };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/dashboard/__tests__/buildDashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/dashboard/buildDashboard.ts lib/server/dashboard/__tests__/buildDashboard.test.ts
git commit -m "feat(dashboard): 순수 buyer 대시보드 집계(KPI+액션큐)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 순수 `buildPgDashboard`

**Files:**
- Modify: `lib/server/dashboard/buildDashboard.ts`
- Test: `lib/server/dashboard/__tests__/buildDashboard.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```ts
import { buildPgDashboard, type PgDashRow } from '../buildDashboard';

describe('buildPgDashboard', () => {
  const row = (over: Partial<PgDashRow>): PgDashRow => ({
    invitationId: 'i', invitationStatus: 'sent', rfpCode: 'P-0', rfpTitle: 't', rfpDeadline: fromNow(20),
    ...over,
  });
  // n: sent (신규), due in 3d → 신규 + 마감임박
  // o: opened (작성중), due 20d → 작성중
  // a: accepted (제출완료) → KPI only
  // o2: opened, due 2d → 작성중 + 마감임박
  const rows: PgDashRow[] = [
    row({ invitationId: 'n', invitationStatus: 'sent', rfpCode: 'P-N', rfpTitle: 'N', rfpDeadline: fromNow(3) }),
    row({ invitationId: 'o', invitationStatus: 'opened', rfpCode: 'P-O', rfpTitle: 'O', rfpDeadline: fromNow(20) }),
    row({ invitationId: 'a', invitationStatus: 'accepted', rfpCode: 'P-A', rfpTitle: 'A', rfpDeadline: fromNow(20) }),
    row({ invitationId: 'o2', invitationStatus: 'opened', rfpCode: 'P-O2', rfpTitle: 'O2', rfpDeadline: fromNow(2) }),
  ];
  const dash = buildPgDashboard(rows, NOW);

  it('computes PG KPI values and deep links', () => {
    const byId = Object.fromEntries(dash.kpis.map((k) => [k.id, k]));
    expect(byId.new.value).toBe(1); // n
    expect(byId.new.href).toBe('/inbox?status=new');
    expect(byId.due.value).toBe(2); // n (3d), o2 (2d) — unsubmitted & urgent
    expect(byId.drafting.value).toBe(2); // o, o2
    expect(byId.submitted.value).toBe(1); // a
  });

  it('builds PG action groups (href uses rfp code), omitting empty', () => {
    const byId = Object.fromEntries(dash.groups.map((g) => [g.id, g]));
    expect(byId.new.items.map((i) => i.id)).toEqual(['n']);
    expect(byId.new.items[0].href).toBe('/inbox/P-N');
    expect(byId.due.items.map((i) => i.id)).toEqual(['o2', 'n']); // deadline asc
    expect(byId.drafting.items.map((i) => i.id)).toEqual(['o', 'o2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/dashboard/__tests__/buildDashboard.test.ts`
Expected: FAIL — `buildPgDashboard` / `PgDashRow` not exported.

- [ ] **Step 3: Implement in `lib/server/dashboard/buildDashboard.ts`**

Append:

```ts
export type PgDashRow = {
  invitationId: string;
  invitationStatus: string;
  rfpCode: string;
  rfpTitle: string;
  rfpDeadline: string;
};

export function buildPgDashboard(rows: PgDashRow[], now: Date): Dashboard {
  const isUrgent = (r: PgDashRow) => matchesDeadlineBucket(r.rfpDeadline, 'd7', now);
  const unsubmitted = (r: PgDashRow) => r.invitationStatus === 'sent' || r.invitationStatus === 'opened';
  const toItem = (r: PgDashRow): ActionItem => ({
    id: r.invitationId, href: `/inbox/${r.rfpCode}`, title: r.rfpTitle, badge: deadlineBadge(r.rfpDeadline, now),
  });

  const kpis: DashboardKpi[] = [
    { id: 'new', label: '신규', value: rows.filter((r) => r.invitationStatus === 'sent').length, href: '/inbox?status=new' },
    { id: 'due', label: '마감 임박', value: rows.filter((r) => unsubmitted(r) && isUrgent(r)).length, href: '/inbox?deadline=d7' },
    { id: 'drafting', label: '작성중', value: rows.filter((r) => r.invitationStatus === 'opened').length, href: '/inbox?status=draft' },
    { id: 'submitted', label: '제출완료', value: rows.filter((r) => r.invitationStatus === 'accepted').length, href: '/inbox?status=submitted' },
  ];

  const newItems = rows.filter((r) => r.invitationStatus === 'sent').map(toItem);
  const dueItems = [...rows]
    .filter((r) => unsubmitted(r) && isUrgent(r))
    .sort((a, b) => new Date(a.rfpDeadline).getTime() - new Date(b.rfpDeadline).getTime())
    .map(toItem);
  const draftingItems = rows.filter((r) => r.invitationStatus === 'opened').map(toItem);

  const groups: ActionGroup[] = [
    { id: 'new', label: '신규 받은 RFP', items: newItems },
    { id: 'due', label: '응답 마감 임박', items: dueItems },
    { id: 'drafting', label: '작성중 응답', items: draftingItems },
  ].filter((g) => g.items.length > 0);

  return { kpis, groups };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/dashboard/__tests__/buildDashboard.test.ts`
Expected: PASS (all blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/server/dashboard/buildDashboard.ts lib/server/dashboard/__tests__/buildDashboard.test.ts
git commit -m "feat(dashboard): 순수 PG 대시보드 집계

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 로더 `loadBuyerDashboard` / `loadPgDashboard`

> **TDD 면제 (CLAUDE.md)**: repo 글루 로더. 집계는 Task 1·2 순수함수가, 카운트는 `countSubmittedBids`가 이미 테스트됨. 검증은 `pnpm tsc --noEmit`.

**Files:**
- Create: `lib/server/dashboard/loadDashboard.ts`

- [ ] **Step 1: Implement `lib/server/dashboard/loadDashboard.ts`**

```ts
// Thin glue: read repos, hand off to the pure builders. server-only.
import {
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import {
  buildBuyerDashboard,
  buildPgDashboard,
  countSubmittedBids,
  type Dashboard,
  type PgDashRow,
} from './buildDashboard';

export async function loadBuyerDashboard(workspaceId: string): Promise<Dashboard> {
  const [rfpRepo, bidRepo] = await Promise.all([getRfpRepo(), getBidRepo()]);
  const rfps = await rfpRepo.findByBuyerWs(workspaceId);
  const bidsByRfp = await bidRepo.findByRfpIds(rfps.map((r) => r.id));
  return buildBuyerDashboard(rfps, countSubmittedBids(bidsByRfp), new Date());
}

export async function loadPgDashboard(workspaceId: string): Promise<Dashboard> {
  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(workspaceId);
  const rows: PgDashRow[] = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpCode: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
  }));
  return buildPgDashboard(rows, new Date());
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors in `lib/server/dashboard/loadDashboard.ts`. If `findByRfpIds`/`findByBuyerWs`/`findByPgWorkspace` signatures differ from the above, STOP and report BLOCKED with the actual signature.

- [ ] **Step 3: Commit**

```bash
git add lib/server/dashboard/loadDashboard.ts
git commit -m "feat(dashboard): 대시보드 로더(repo 글루)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `KpiStrip` 컴포넌트

**Files:**
- Create: `components/home/KpiStrip.tsx`
- Test: `components/home/__tests__/KpiStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/home/__tests__/KpiStrip.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { KpiStrip } from '../KpiStrip';
import type { DashboardKpi } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const kpis: DashboardKpi[] = [
  { id: 'active', label: '진행중', value: 8, href: '/rfp?status=active' },
  { id: 'due', label: '마감 임박', value: 2, href: '/rfp?status=active&deadline=d7' },
];

describe('KpiStrip', () => {
  it('renders each KPI as a link with label and value', () => {
    render(<KpiStrip kpis={kpis} />);
    const active = screen.getByRole('link', { name: /진행중/ });
    expect(active).toHaveAttribute('href', '/rfp?status=active');
    expect(active).toHaveTextContent('8');
    expect(screen.getByRole('link', { name: /마감 임박/ })).toHaveAttribute(
      'href',
      '/rfp?status=active&deadline=d7',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/home/__tests__/KpiStrip.test.tsx`
Expected: FAIL — cannot resolve `../KpiStrip`.

- [ ] **Step 3: Write minimal implementation**

`components/home/KpiStrip.tsx`:

```tsx
import Link from 'next/link';
import type { DashboardKpi } from '@/lib/server/dashboard/buildDashboard';

export function KpiStrip({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <Link
          key={kpi.id}
          href={kpi.href}
          className="flex flex-col gap-1 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3 transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
        >
          <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{kpi.label}</span>
          <span className="md-numeric text-[22px] font-semibold text-[var(--md-sys-color-on-surface)]">{kpi.value}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/home/__tests__/KpiStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/home/KpiStrip.tsx components/home/__tests__/KpiStrip.test.tsx
git commit -m "feat(dashboard): KpiStrip 클릭형 KPI 타일

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `ActionQueue` 컴포넌트

**Files:**
- Create: `components/home/ActionQueue.tsx`
- Test: `components/home/__tests__/ActionQueue.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/home/__tests__/ActionQueue.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { ActionQueue } from '../ActionQueue';
import type { ActionGroup } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const groups: ActionGroup[] = [
  {
    id: 'due', label: '마감 임박', items: [
      { id: 'P-A', href: '/rfp/P-A', title: 'A 제안요청', badge: 'D-3' },
    ],
  },
  {
    id: 'review', label: '응답 도착·검토대기', items: [
      { id: 'P-B', href: '/rfp/P-B', title: 'B 제안요청', badge: '응답 2건' },
    ],
  },
];

describe('ActionQueue', () => {
  it('renders each group label and its items as links with title + badge', () => {
    render(<ActionQueue groups={groups} />);
    expect(screen.getByText('마감 임박')).toBeInTheDocument();
    const a = screen.getByRole('link', { name: /A 제안요청/ });
    expect(a).toHaveAttribute('href', '/rfp/P-A');
    expect(a).toHaveTextContent('D-3');
    const b = screen.getByRole('link', { name: /B 제안요청/ });
    expect(b).toHaveTextContent('응답 2건');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/home/__tests__/ActionQueue.test.tsx`
Expected: FAIL — cannot resolve `../ActionQueue`.

- [ ] **Step 3: Write minimal implementation**

`components/home/ActionQueue.tsx`:

```tsx
import Link from 'next/link';
import type { ActionGroup } from '@/lib/server/dashboard/buildDashboard';

export function ActionQueue({ groups }: { groups: ActionGroup[] }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.id}>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            {group.label}
            <span className="md-numeric">{group.items.length}</span>
          </h3>
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-2.5 text-[14px] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
                >
                  <span className="truncate text-[var(--md-sys-color-on-surface)]">{item.title}</span>
                  <span className="md-numeric shrink-0 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{item.badge}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/home/__tests__/ActionQueue.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/home/ActionQueue.tsx components/home/__tests__/ActionQueue.test.tsx
git commit -m "feat(dashboard): ActionQueue '지금 처리할 일' 리스트

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `ChatPanelPlaceholder` 컴포넌트

**Files:**
- Create: `components/home/ChatPanelPlaceholder.tsx`
- Test: `components/home/__tests__/ChatPanelPlaceholder.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/home/__tests__/ChatPanelPlaceholder.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { ChatPanelPlaceholder } from '../ChatPanelPlaceholder';

afterEach(() => cleanup());

describe('ChatPanelPlaceholder', () => {
  it('renders the 메시지 header, an empty-conversation state, and a disabled 새 메시지 CTA', () => {
    render(<ChatPanelPlaceholder />);
    expect(screen.getByText('메시지')).toBeInTheDocument();
    expect(screen.getByText('대화가 아직 없습니다')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: '새 메시지' });
    expect(cta).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/home/__tests__/ChatPanelPlaceholder.test.tsx`
Expected: FAIL — cannot resolve `../ChatPanelPlaceholder`.

- [ ] **Step 3: Write minimal implementation**

`components/home/ChatPanelPlaceholder.tsx`:

```tsx
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';

/**
 * 채팅 placeholder — RFP별 비공개 1:N 구조상 채팅의 최종 형태는 RFP별 스레드 목록.
 * 빈 대화 목록 + 비활성 CTA로 그 구조를 미리 텔레그래프(렌더 전용, 백엔드 없음).
 */
export function ChatPanelPlaceholder() {
  return (
    <aside
      aria-label="메시지"
      className="flex h-full min-h-[320px] flex-col rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
    >
      <header className="border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
        메시지
      </header>
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<EnvelopeIcon />}
          title="대화가 아직 없습니다"
          description="구매사·PG 간 메시지가 곧 제공됩니다."
        />
      </div>
      <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] py-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)] opacity-60"
        >
          새 메시지
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/home/__tests__/ChatPanelPlaceholder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/home/ChatPanelPlaceholder.tsx components/home/__tests__/ChatPanelPlaceholder.test.tsx
git commit -m "feat(dashboard): ChatPanelPlaceholder (RFP별 스레드 텔레그래프)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `HomeDashboard` 레이아웃 + 스켈레톤

**Files:**
- Create: `components/home/HomeDashboard.tsx`
- Test: `components/home/__tests__/HomeDashboard.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/home/__tests__/HomeDashboard.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { HomeDashboard } from '../HomeDashboard';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const withGroups: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 8, href: '/rfp?status=active' }],
  groups: [{ id: 'due', label: '마감 임박', items: [{ id: 'P-A', href: '/rfp/P-A', title: 'A', badge: 'D-3' }] }],
};

const empty: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 0, href: '/rfp?status=active' }],
  groups: [],
};

describe('HomeDashboard', () => {
  it('renders KPI strip, action queue, and the chat panel', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" />);
    // KPI strip (link), action item (link → detail), chat panel.
    // NOTE: don't getByText('마감 임박') — a KPI and an action group can share
    // that label; anchor on the unique action item instead.
    expect(screen.getByRole('link', { name: /진행중/ })).toBeInTheDocument();
    const item = screen.getByRole('link', { name: /A/ });
    expect(item).toHaveAttribute('href', '/rfp/P-A');
    expect(item).toHaveTextContent('D-3');
    expect(screen.getByLabelText('메시지')).toBeInTheDocument();
  });

  it('shows a workspace-specific empty state when there are no action groups', () => {
    render(<HomeDashboard dashboard={empty} workspaceType="pg" />);
    expect(screen.getByText('지금 처리할 일이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('구매사가 초대한 RFP가 여기에 표시됩니다.')).toBeInTheDocument();
    // KPI strip still rendered
    expect(screen.getByRole('link', { name: /진행중/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/home/__tests__/HomeDashboard.test.tsx`
Expected: FAIL — cannot resolve `../HomeDashboard`.

- [ ] **Step 3: Write minimal implementation**

`components/home/HomeDashboard.tsx`:

```tsx
import { KpiStrip } from './KpiStrip';
import { ActionQueue } from './ActionQueue';
import { ChatPanelPlaceholder } from './ChatPanelPlaceholder';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckIcon } from '@/components/icons';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';

const EMPTY_DESC: Record<'buyer' | 'pg', string> = {
  buyer: '새 응답이 오거나 마감이 다가오면 여기에 표시됩니다.',
  pg: '구매사가 초대한 RFP가 여기에 표시됩니다.',
};

export function HomeDashboard({
  dashboard,
  workspaceType,
}: {
  dashboard: Dashboard;
  workspaceType: 'buyer' | 'pg';
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <KpiStrip kpis={dashboard.kpis} />
        {dashboard.groups.length > 0 ? (
          <ActionQueue groups={dashboard.groups} />
        ) : (
          <EmptyState
            icon={<CheckIcon />}
            title="지금 처리할 일이 없습니다"
            description={EMPTY_DESC[workspaceType]}
          />
        )}
      </div>
      <div className="lg:w-[360px] lg:shrink-0">
        <ChatPanelPlaceholder />
      </div>
    </div>
  );
}

// Named export (not a static on a 'use client' component) so a Server Component
// Suspense fallback can render it across the RSC boundary.
export function HomeDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-[var(--md-sys-shape-medium)]" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <Skeleton className="h-[320px] rounded-[var(--md-sys-shape-medium)] lg:w-[360px] lg:shrink-0" />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/home/__tests__/HomeDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/home/HomeDashboard.tsx components/home/__tests__/HomeDashboard.test.tsx
git commit -m "feat(dashboard): HomeDashboard 2단 레이아웃 + 스켈레톤

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `BuyerHome`/`PgHome`/`home/page.tsx` 결선

> **TDD 면제**: 컴포넌트 조립 + 이미 테스트된 유닛 결선. 검증은 tsc/eslint + 홈 가드 테스트.

**Files:**
- Modify: `components/home/BuyerHome.tsx` (전체 재작성)
- Modify: `components/home/PgHome.tsx` (전체 재작성)
- Modify: `app/(app)/home/page.tsx` (Suspense fallback 교체)
- Modify: `app/(app)/home/__tests__/page.test.tsx` (불필요해진 KanbanBoard 목 제거)

- [ ] **Step 0: Check for e2e coverage of the old home (flag before rewriting)**

Run: `grep -rnE "home|kanban|pipeline|보드" e2e/ 2>/dev/null | grep -i home | head`
If any Playwright spec asserts the old `/home` kanban (e.g., a `data-column-title`/board selector on `/home`), note it — that e2e will need updating after this task (unit tests won't catch it). If none, proceed. (e2e is run separately via `pnpm e2e`, not part of `pnpm test`.)

- [ ] **Step 1: Rewrite `components/home/BuyerHome.tsx`**

```tsx
import { PageEnter } from '@/components/primitives/PageEnter';
import { loadBuyerDashboard } from '@/lib/server/dashboard/loadDashboard';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function BuyerHome({ workspaceId }: { workspaceId: string }) {
  const dashboard = await loadBuyerDashboard(workspaceId);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard dashboard={dashboard} workspaceType="buyer" />
    </PageEnter>
  );
}
```

- [ ] **Step 2: Rewrite `components/home/PgHome.tsx`**

```tsx
import { PageEnter } from '@/components/primitives/PageEnter';
import { loadPgDashboard } from '@/lib/server/dashboard/loadDashboard';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function PgHome({ workspaceId }: { workspaceId: string }) {
  const dashboard = await loadPgDashboard(workspaceId);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard dashboard={dashboard} workspaceType="pg" />
    </PageEnter>
  );
}
```

(The old "받은 제안 요청이 없습니다" empty-state is dropped — when there are no invitations, KPIs are all 0 and the action queue shows the "지금 처리할 일이 없습니다" empty state from `HomeDashboard`.)

- [ ] **Step 3: Update `app/(app)/home/page.tsx` Suspense fallbacks**

Replace the import:
```tsx
import { KanbanBoardSkeleton } from '@/components/board/KanbanBoard';
```
with:
```tsx
import { HomeDashboardSkeleton } from '@/components/home/HomeDashboard';
```
And replace BOTH Suspense fallbacks (the PG one and the buyer one) — change each:
```tsx
        <Suspense fallback={<div className="px-8 py-10"><KanbanBoardSkeleton /></div>}>
```
to:
```tsx
        <Suspense fallback={<div className="px-8 py-10"><HomeDashboardSkeleton /></div>}>
```
(Leave the rest of `home/page.tsx` — auth guard, `PgRfpBlockedToast`, redirects — unchanged.)

- [ ] **Step 4: Update the home guard test mock**

In `app/(app)/home/__tests__/page.test.tsx`, remove the now-stale mock:
```tsx
vi.mock('@/components/board/KanbanBoard', () => ({
  KanbanBoardSkeleton: () => null,
}));
```
(The fallback never renders in these tests — `BuyerHome`/`PgHome` are mocked to `null` and resolve immediately — and `HomeDashboardSkeleton` is a plain server component with no client/DB deps, so no replacement mock is needed. The two guard tests stay unchanged otherwise.)

- [ ] **Step 5: Verify**

Run: `pnpm test "app/(app)/home/__tests__/page.test.tsx"` → Expected: 2 passed (auth guard intact).
Run: `pnpm tsc --noEmit` → Expected: no new errors.
Run: `./node_modules/.bin/eslint components/home/BuyerHome.tsx components/home/PgHome.tsx 'app/(app)/home/page.tsx' 'app/(app)/home/__tests__/page.test.tsx'` → Expected: clean.

- [ ] **Step 6: Manual browser verification (record result)**

`pnpm dev`; as a buyer at `/home`: 4 클릭형 KPI 타일(진행중/마감임박/응답검토대기/계약완료) + "지금 처리할 일" 그룹 + 우측 메시지 패널. KPI 클릭 → 필터된 `/rfp`. 액션 행 클릭 → RFP 상세. PG `/home`: 신규/마감임박/작성중/제출완료 + PG 액션큐 + 메시지 패널. 데이터 없으면 "지금 처리할 일이 없습니다".

- [ ] **Step 7: Commit**

```bash
git add components/home/BuyerHome.tsx components/home/PgHome.tsx 'app/(app)/home/page.tsx' 'app/(app)/home/__tests__/page.test.tsx'
git commit -m "feat(home): /home을 칸반에서 2단 대시보드로 전환 (buyer·PG)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (whole-plan)

- [ ] `pnpm test` → all green (no new failures vs main baseline).
- [ ] `pnpm tsc --noEmit` → clean.
- [ ] `./node_modules/.bin/eslint .` → clean.
- [ ] 수동: buyer/PG `/home` 대시보드 + 빈 상태 + KPI/액션 딥링크 동작.

## Self-Review notes (spec §1 ↔ plan)

- KPI 정의(buyer 진행중/마감임박/응답검토대기/계약완료 + 딥링크) → Task 1.
- 액션큐(마감임박/응답도착·검토대기/무응답경과, 0건 그룹 숨김, 전부 0이면 EmptyState) → Task 1 + Task 7.
- PG KPI/액션큐(신규/마감임박/작성중/제출완료) → Task 2.
- bidCount 선행 인프라 → 기존 `findByRfpIds` 재사용 + `countSubmittedBids`(Task 1) + 로더(Task 3). 신규 repo 메서드 불필요(스펙의 `findByBuyerWsWithBidCount`보다 단순).
- 2단 레이아웃(좌 대시보드 / 우 채팅 레일, md↓ 스택) → Task 7.
- 채팅 placeholder(헤더 "메시지" + 빈 대화목록 + 비활성 "새 메시지", 스레드 텔레그래프, 백엔드 없음) → Task 6.
- 도메인 가드(경쟁사 정보 0, 결재선 0) → 집계 입력이 자기 워크스페이스 RFP/inbox뿐, 경쟁 필드 미사용.
- 마감 판정은 Plan 1 `matchesDeadlineBucket('d7')` 재사용(DRY). `formatDeadline`의 `Date.now()` 비결정성 회피 위해 `deadlineBadge(_, now)` 별도.
- 면제: 로더(Task 3)·홈 조립(Task 8)은 순수 유닛 + 가드 테스트로 커버.
