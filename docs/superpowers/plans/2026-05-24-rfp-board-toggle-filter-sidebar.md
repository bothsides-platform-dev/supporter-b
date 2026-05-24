# RFP/받은RFP 보드 토글 + 인페이지 필터 + 사이드바 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RFP(`/rfp`)·받은RFP(`/inbox`) 목록에 칸반↔표 뷰 토글과 상단 인페이지 필터(상태·마감일·등급)를 붙이고, 그 결과 중복된 사이드바 상태 하위항목을 제거한다.

**Architecture:** 필터는 **행(row) 데이터**(buyer: `RFP[]`, PG: `InboxRow[]`)에 적용해 `visibleIds` 집합을 만든다. 표 뷰는 필터된 행을 그대로 렌더하고, 칸반 뷰는 **필터된 카드 배열**(`loadBoard`의 cards에서 `visibleIds`로 거른 것)을 기존 `PipelineBoard`에 넘긴다 — 칼럼은 그대로, `KanbanBoard`는 무수정. 칸반은 카드별 수동 정렬 위치를 저장하지 않고(드롭은 컬럼만 바꾸고 컬럼 내 순서는 `loadBoard`가 도메인 비교자로 재계산), 따라서 카드를 숨겨도 순서 손상이 없다. 뷰 선택은 `?view=` URL 파라미터가 source of truth, 부재 시 페이지별 쿠키(`rfpBoardView`/`inboxBoardView`), 그것도 없으면 `'table'`.

**Tech Stack:** Next.js 16 App Router(async `searchParams`/`cookies`), React 19, TypeScript strict, Vitest(`unit-node` + `unit-jsdom` projects), Testing Library, Tailwind v4 + `--md-sys-*` 토큰.

**선행 사실 (코드 검증됨):**
- `loadBoard({ workspaceId, workspaceType, kind: 'pipeline' })` → `{ columns, cards }`. `card.cardId` = uuid (buyer: `rfp.id`, PG: `invitation.id`). `card.payload.rfpId` = 표시용 code.
- buyer 행: `getRfpRepo().findByBuyerWs(wsId)` → `RFP[]` (`r.id` uuid, `r.status`, `r.deadline`, `r.bizProfile?.grade`).
- PG 행: `app/(app)/inbox/page.tsx`가 `getInvitationRepo().findByPgWorkspace(wsId)` pairs를 `InboxRow`로 매핑 (`invitationId`=uuid, `invitationStatus`, `rfpStatus`, `rfpDeadline`, `grade`(라벨)).
- 기존 상태 필터: `lib/server/status-filter.ts`의 `filterRfpsByParam(rfps, token)` / `filterInboxRowsByParam(rows, token)` (재사용 → URL 하위호환).
- 등급 enum: `MerchantGrade = 'small'|'sme1'|'sme2'|'sme3'|'general'`, 라벨 `GRADE_LABELS` (`lib/types/biz-profile.ts`).
- `PipelineBoard`(client)는 `{ cardType, columns, cards }`를 받아 `KanbanBoard`로 렌더하고 카드 클릭 시 buyer→`/rfp/[code]`, PG→`/inbox/[code]`로 이동.
- 뷰 토글은 `Tabs` 프리미티브 재사용(대괄호 라벨 금지 — DESIGN.md 하드룰).

**범위 밖 (Plan 2):** 홈 2단 대시보드, bidCount 집계 인프라.

**주의 (인터림):** 칸반은 현재 `/home`에도 있다. Plan 1 적용 후엔 `/rfp`(board view)와 `/home`이 같은 보드를 잠시 둘 다 보여준다 — Plan 2에서 `/home`이 대시보드로 바뀌며 해소된다. 의도된 점진 출시.

---

## Task 1: 순수 필터·뷰 해석 모듈 (buyer)

**Files:**
- Create: `lib/server/board/filterRfps.ts`
- Test: `lib/server/board/__tests__/filterRfps.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/server/board/__tests__/filterRfps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  matchesDeadlineBucket,
  matchesGrade,
  resolveBoardView,
  filterRfps,
} from '../filterRfps';
import type { RFP } from '@/lib/types/rfp';

// Fixed "now": 2026-05-24 (local).
const NOW = new Date(2026, 4, 24, 9, 0, 0);
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).toISOString();

describe('matchesDeadlineBucket', () => {
  it('returns true when bucket is absent/unknown (no filter)', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 27), undefined, NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 27), '', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 27), 'bogus', NOW)).toBe(true);
  });

  it('d7 = today through +7 days', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 27), 'd7', NOW)).toBe(true); // +3
    expect(matchesDeadlineBucket(iso(2026, 6, 3), 'd7', NOW)).toBe(false); // +10
    expect(matchesDeadlineBucket(iso(2026, 5, 23), 'd7', NOW)).toBe(false); // -1 (overdue)
  });

  it('overdue = strictly before today', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 23), 'overdue', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 24), 'overdue', NOW)).toBe(false);
    expect(matchesDeadlineBucket(iso(2026, 5, 27), 'overdue', NOW)).toBe(false);
  });

  it('month = same calendar month/year', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 15), 'month', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 30), 'month', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 6, 1), 'month', NOW)).toBe(false);
  });
});

describe('matchesGrade', () => {
  it('returns true when no grade param (no filter)', () => {
    expect(matchesGrade('sme1', undefined)).toBe(true);
    expect(matchesGrade(undefined, '')).toBe(true);
  });
  it('matches exact raw grade enum', () => {
    expect(matchesGrade('sme1', 'sme1')).toBe(true);
    expect(matchesGrade('general', 'sme1')).toBe(false);
    expect(matchesGrade(undefined, 'sme1')).toBe(false);
  });
});

describe('resolveBoardView', () => {
  it('prefers URL param when valid', () => {
    expect(resolveBoardView('board', 'table')).toBe('board');
    expect(resolveBoardView('table', 'board')).toBe('table');
  });
  it('falls back to cookie when param absent/invalid', () => {
    expect(resolveBoardView(undefined, 'board')).toBe('board');
    expect(resolveBoardView('bogus', 'board')).toBe('board');
  });
  it('defaults to table when neither valid', () => {
    expect(resolveBoardView(undefined, undefined)).toBe('table');
    expect(resolveBoardView('bogus', 'bogus')).toBe('table');
  });
});

describe('filterRfps (status + deadline + grade, AND)', () => {
  const base: Omit<RFP, 'id' | 'status' | 'deadline' | 'bizProfile'> = {
    code: 'P-2605-0001',
    buyerWsId: 'ws1',
    title: 't',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    createdBy: 'u1',
    createdAt: iso(2026, 5, 1),
  };
  const rfp = (over: Partial<RFP>): RFP => ({ ...base, id: 'x', status: 'sent', deadline: iso(2026, 5, 27), ...over } as RFP);

  const rows: RFP[] = [
    rfp({ id: 'a', status: 'sent', deadline: iso(2026, 5, 27), bizProfile: { grade: 'sme1', gradeSource: 'unset' } }),
    rfp({ id: 'b', status: 'draft', deadline: iso(2026, 6, 10), bizProfile: { grade: 'general', gradeSource: 'unset' } }),
    rfp({ id: 'c', status: 'sent', deadline: iso(2026, 6, 10), bizProfile: { grade: 'sme1', gradeSource: 'unset' } }),
  ];

  it('no params → all', () => {
    expect(filterRfps(rows, {}, NOW).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('status=active (→ sent)', () => {
    expect(filterRfps(rows, { status: 'active' }, NOW).map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('deadline=d7 keeps only near deadlines', () => {
    expect(filterRfps(rows, { deadline: 'd7' }, NOW).map((r) => r.id)).toEqual(['a']);
  });
  it('grade=sme1', () => {
    expect(filterRfps(rows, { grade: 'sme1' }, NOW).map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('combined status=active & grade=sme1 & deadline=d7', () => {
    expect(filterRfps(rows, { status: 'active', grade: 'sme1', deadline: 'd7' }, NOW).map((r) => r.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/board/__tests__/filterRfps.test.ts`
Expected: FAIL — `Failed to resolve import "../filterRfps"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

`lib/server/board/filterRfps.ts`:

```ts
// Pure board filtering + view resolution. Composes the existing status-filter
// mapping with deadline-bucket and grade predicates. Server-importable (type-only
// component import is erased — see status-filter.ts precedent).
import type { RFP } from '@/lib/types/rfp';
import { filterRfpsByParam } from '@/lib/server/status-filter';

export type BoardView = 'table' | 'board';

export type BoardFilterParams = {
  status?: string;
  deadline?: string;
  grade?: string;
};

const DAY = 24 * 60 * 60 * 1000;

/** Deadline bucket predicate. Unknown/absent bucket → true (no filter). */
export function matchesDeadlineBucket(
  deadline: string,
  bucket: string | undefined,
  now: Date,
): boolean {
  if (bucket !== 'd7' && bucket !== 'month' && bucket !== 'overdue') return true;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (bucket === 'overdue') return t < startOfToday;
  if (bucket === 'd7') return t >= startOfToday && t < startOfToday + 8 * DAY;
  // month
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Raw grade-enum equality. Absent param → true (no filter). */
export function matchesGrade(grade: string | undefined, gradeParam: string | undefined): boolean {
  if (!gradeParam) return true;
  return grade === gradeParam;
}

/** URL param > cookie > 'table'. */
export function resolveBoardView(
  paramView: string | undefined,
  cookieView: string | undefined,
): BoardView {
  if (paramView === 'table' || paramView === 'board') return paramView;
  if (cookieView === 'table' || cookieView === 'board') return cookieView;
  return 'table';
}

export function filterRfps(rfps: RFP[], params: BoardFilterParams, now: Date): RFP[] {
  return filterRfpsByParam(rfps, params.status)
    .filter((r) => matchesDeadlineBucket(r.deadline, params.deadline, now))
    .filter((r) => matchesGrade(r.bizProfile?.grade, params.grade));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/board/__tests__/filterRfps.test.ts`
Expected: PASS (all describe blocks except `filterInboxRows`, added in Task 2).

- [ ] **Step 5: Commit**

```bash
git add lib/server/board/filterRfps.ts lib/server/board/__tests__/filterRfps.test.ts
git commit -m "feat(board): 순수 필터(상태·마감·등급)+뷰 해석 모듈 (buyer)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PG 행 필터 + `InboxRow.gradeRaw`

**Files:**
- Modify: `components/inbox/InboxList.tsx` (InboxRow 타입에 `gradeRaw` 추가)
- Modify: `lib/server/board/filterRfps.ts` (`filterInboxRows` 추가)
- Test: `lib/server/board/__tests__/filterRfps.test.ts` (append)

- [ ] **Step 1: Add `gradeRaw` to InboxRow (so the test compiles)**

In `components/inbox/InboxList.tsx`, extend the `InboxRow` type (add the import + field):

```ts
import type { MerchantGrade } from '@/lib/types/biz-profile';
```

```ts
export type InboxRow = {
  invitationId: string;
  invitationStatus: string;
  /** Domain status of the parent RFP — used by the closed-filter mapping. */
  rfpStatus: string;
  rfpId: string;
  rfpTitle: string;
  rfpDeadline: string;
  grade: string;
  /** Raw merchant-grade enum for the grade filter (label lives in `grade`). */
  gradeRaw?: MerchantGrade;
};
```

- [ ] **Step 2: Write the failing test (append to filterRfps.test.ts)**

```ts
import { filterInboxRows } from '../filterRfps';
import type { InboxRow } from '@/components/inbox/InboxList';

describe('filterInboxRows (status + deadline + grade, AND)', () => {
  const row = (over: Partial<InboxRow>): InboxRow => ({
    invitationId: 'i', invitationStatus: 'sent', rfpStatus: 'sent',
    rfpId: 'P-1', rfpTitle: 't', rfpDeadline: iso(2026, 5, 27), grade: '중소1', gradeRaw: 'sme1',
    ...over,
  });
  const rows: InboxRow[] = [
    row({ invitationId: 'a', invitationStatus: 'sent', rfpDeadline: iso(2026, 5, 27), gradeRaw: 'sme1' }),
    row({ invitationId: 'b', invitationStatus: 'opened', rfpDeadline: iso(2026, 6, 10), gradeRaw: 'general' }),
    row({ invitationId: 'c', invitationStatus: 'accepted', rfpDeadline: iso(2026, 6, 10), gradeRaw: 'sme1' }),
  ];

  it('no params → all', () => {
    expect(filterInboxRows(rows, {}, NOW).map((r) => r.invitationId)).toEqual(['a', 'b', 'c']);
  });
  it('status=new (→ invitation sent)', () => {
    expect(filterInboxRows(rows, { status: 'new' }, NOW).map((r) => r.invitationId)).toEqual(['a']);
  });
  it('deadline=d7', () => {
    expect(filterInboxRows(rows, { deadline: 'd7' }, NOW).map((r) => r.invitationId)).toEqual(['a']);
  });
  it('grade=sme1', () => {
    expect(filterInboxRows(rows, { grade: 'sme1' }, NOW).map((r) => r.invitationId)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test lib/server/board/__tests__/filterRfps.test.ts`
Expected: FAIL — `filterInboxRows` is not exported.

- [ ] **Step 4: Implement `filterInboxRows` in `lib/server/board/filterRfps.ts`**

Add the import and function:

```ts
import type { InboxRow } from '@/components/inbox/InboxList';
import { filterInboxRowsByParam } from '@/lib/server/status-filter';
```

```ts
export function filterInboxRows(rows: InboxRow[], params: BoardFilterParams, now: Date): InboxRow[] {
  return filterInboxRowsByParam(rows, params.status)
    .filter((r) => matchesDeadlineBucket(r.rfpDeadline, params.deadline, now))
    .filter((r) => matchesGrade(r.gradeRaw, params.grade));
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm test lib/server/board/__tests__/filterRfps.test.ts` → Expected: PASS (all blocks).
Run: `pnpm tsc --noEmit` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/server/board/filterRfps.ts lib/server/board/__tests__/filterRfps.test.ts components/inbox/InboxList.tsx
git commit -m "feat(board): PG 행 필터 + InboxRow.gradeRaw

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: BoardViewToggle 컴포넌트

**Files:**
- Create: `components/board/BoardViewToggle.tsx`
- Test: `components/board/__tests__/BoardViewToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/board/__tests__/BoardViewToggle.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const mockPathname = vi.fn(() => '/rfp');
const mockSearchParams = vi.fn(() => new URLSearchParams('status=active'));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

import { BoardViewToggle } from '../BoardViewToggle';

beforeEach(() => {
  push.mockClear();
  mockPathname.mockReturnValue('/rfp');
  mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
  document.cookie = 'rfpBoardView=; max-age=0; path=/';
});
afterEach(() => cleanup());

describe('BoardViewToggle', () => {
  it('renders 표/칸반 tabs with the active one selected', () => {
    render(<BoardViewToggle view="table" cookieName="rfpBoardView" tableCount={3} />);
    expect(screen.getByRole('tab', { name: /표/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '칸반' })).toHaveAttribute('aria-selected', 'false');
  });

  it('on switch: pushes ?view=board preserving other params and writes the cookie', async () => {
    const user = userEvent.setup();
    render(<BoardViewToggle view="table" cookieName="rfpBoardView" />);
    await user.click(screen.getByRole('tab', { name: '칸반' }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain('view=board');
    expect(url).toContain('status=active');
    expect(document.cookie).toContain('rfpBoardView=board');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/board/__tests__/BoardViewToggle.test.tsx`
Expected: FAIL — cannot resolve `../BoardViewToggle`.

- [ ] **Step 3: Write minimal implementation**

`components/board/BoardViewToggle.tsx`:

```tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/primitives/Tabs';
import type { BoardView } from '@/lib/server/board/filterRfps';

type Props = {
  view: BoardView;
  cookieName: string;
  tableCount?: number;
};

export function BoardViewToggle({ view, cookieName, tableCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setView = (id: string) => {
    if (id !== 'table' && id !== 'board') return;
    document.cookie = `${cookieName}=${id}; path=/; max-age=31536000; samesite=lax`;
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', id);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Tabs
      className="border-b-0"
      tabs={[
        { id: 'table', label: '표', count: tableCount },
        { id: 'board', label: '칸반' },
      ]}
      active={view}
      onChange={setView}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/board/__tests__/BoardViewToggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/board/BoardViewToggle.tsx components/board/__tests__/BoardViewToggle.test.tsx
git commit -m "feat(board): 표/칸반 뷰 토글 (URL ?view= + 페이지별 쿠키)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: BoardFilterBar 컴포넌트

**Files:**
- Create: `components/board/BoardFilterBar.tsx`
- Test: `components/board/__tests__/BoardFilterBar.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/board/__tests__/BoardFilterBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const mockPathname = vi.fn(() => '/rfp');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

import { BoardFilterBar } from '../BoardFilterBar';

const STATUS = [
  { value: 'draft', label: '작성중' },
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '마감' },
  { value: 'awarded', label: '계약완료' },
];
const GRADE = [
  { value: 'small', label: '영세' },
  { value: 'sme1', label: '중소1' },
  { value: 'general', label: '일반' },
];

beforeEach(() => {
  push.mockClear();
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
});
afterEach(() => cleanup());

describe('BoardFilterBar', () => {
  it('selecting a status pushes ?status=active', async () => {
    const user = userEvent.setup();
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.click(screen.getByRole('button', { name: '진행중' }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toContain('status=active');
  });

  it('clicking the active status again removes the param', async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.click(screen.getByRole('button', { name: '진행중' }));
    const url = push.mock.calls[0][0] as string;
    expect(url).not.toContain('status=active');
  });

  it('selecting a grade pushes ?grade=sme1 and preserves existing params', async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams('view=board'));
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.selectOptions(screen.getByLabelText('가맹점 등급'), 'sme1');
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain('grade=sme1');
    expect(url).toContain('view=board');
  });

  it('clearing the only param pushes the bare pathname (no trailing ?)', async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.click(screen.getByRole('button', { name: '진행중' }));
    expect(push).toHaveBeenCalledWith('/rfp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/board/__tests__/BoardFilterBar.test.tsx`
Expected: FAIL — cannot resolve `../BoardFilterBar`.

- [ ] **Step 3: Write minimal implementation**

`components/board/BoardFilterBar.tsx`:

```tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };

const DEADLINE_OPTIONS: Option[] = [
  { value: 'd7', label: '마감임박' },
  { value: 'month', label: '이번달' },
  { value: 'overdue', label: '지난마감' },
];

export function BoardFilterBar({
  statusOptions,
  gradeOptions,
}: {
  statusOptions: Option[];
  gradeOptions: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = (key: string) => searchParams.get(key) ?? '';

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex items-center gap-3 flex-wrap" role="group" aria-label="필터">
      <ChipGroup param="status" options={statusOptions} current={current('status')} onSelect={setParam} />
      <ChipGroup param="deadline" options={DEADLINE_OPTIONS} current={current('deadline')} onSelect={setParam} />
      <select
        aria-label="가맹점 등급"
        value={current('grade')}
        onChange={(e) => setParam('grade', e.target.value)}
        className="h-7 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 text-[13px] text-[var(--md-sys-color-on-surface)]"
      >
        <option value="">등급 전체</option>
        {gradeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChipGroup({
  param,
  options,
  current,
  onSelect,
}: {
  param: string;
  options: Option[];
  current: string;
  onSelect: (key: string, value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(param, active ? '' : o.value)}
            className={cn(
              'h-7 px-2.5 rounded-[var(--md-sys-shape-small)] text-[13px] border transition-colors',
              active
                ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)]'
                : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/board/__tests__/BoardFilterBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/board/BoardFilterBar.tsx components/board/__tests__/BoardFilterBar.test.tsx
git commit -m "feat(board): 인페이지 필터 바(상태·마감일·등급, URL 파라미터)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `/rfp` 페이지 통합 (buyer)

> **TDD 면제 (CLAUDE.md)**: `app/**/page.tsx` 단순 조립 + 이미 테스트된 순수 유닛(`filterRfps`/`resolveBoardView`) + 테스트된 클라이언트 컴포넌트(toggle/filterbar) 결선. 검증은 typecheck/lint + 수동 브라우저 체크리스트.

**Files:**
- Modify: `app/(app)/rfp/page.tsx` (전체 재작성)

- [ ] **Step 1: Rewrite `app/(app)/rfp/page.tsx`**

```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FileTextIcon, PlusIcon } from '@/components/icons';
import { RfpListTable, RfpListTableSkeleton } from '@/components/rfp/RfpListTable';
import { PipelineBoard } from '@/components/board/PipelineBoard';
import { BoardViewToggle } from '@/components/board/BoardViewToggle';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { auth } from '@/auth';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { filterRfps, resolveBoardView, type BoardView, type BoardFilterParams } from '@/lib/server/board/filterRfps';
import { GRADE_LABELS } from '@/lib/types/biz-profile';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'draft', label: '작성중' },
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '마감' },
  { value: 'awarded', label: '계약완료' },
];
const GRADE_OPTIONS = Object.entries(GRADE_LABELS).map(([value, label]) => ({ value, label }));

type Props = {
  searchParams: Promise<{ status?: string; deadline?: string; grade?: string; view?: string }>;
};

export default async function RfpListPage({ searchParams }: Props) {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect('/login?next=/rfp');
  }

  const sp = await searchParams;
  const cookieStore = await cookies();
  const view = resolveBoardView(sp.view, cookieStore.get('rfpBoardView')?.value);
  const wsId = session.user.workspaceId;

  const newRfpAction = (
    <Link href="/rfp/new">
      <Button size="sm" icon={<PlusIcon />}>
        새 RFP
      </Button>
    </Link>
  );

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title="RFP" action={newRfpAction} />
            <RfpListTableSkeleton />
          </>
        }
      >
        <RfpListPageLoader wsId={wsId} params={sp} view={view} newRfpAction={newRfpAction} />
      </Suspense>
    </div>
  );
}

async function RfpListPageLoader({
  wsId,
  params,
  view,
  newRfpAction,
}: {
  wsId: string;
  params: BoardFilterParams;
  view: BoardView;
  newRfpAction: React.ReactNode;
}) {
  const now = new Date();
  const allRfps = await (await getRfpRepo()).findByBuyerWs(wsId);
  const rfps = filterRfps(allRfps, params, now);

  return (
    <>
      <PageHeader title="RFP" count={rfps.length} action={newRfpAction} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar statusOptions={STATUS_OPTIONS} gradeOptions={GRADE_OPTIONS} />
        <BoardViewToggle view={view} cookieName="rfpBoardView" tableCount={rfps.length} />
      </div>
      {view === 'board' ? (
        <RfpBoardView wsId={wsId} visibleIds={new Set(rfps.map((r) => r.id))} />
      ) : rfps.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={32} />}
          title="조건에 맞는 제안 요청이 없습니다."
          description="필터를 바꾸거나 새 제안 요청을 작성하세요."
        />
      ) : (
        <RfpListTable rfps={rfps} />
      )}
    </>
  );
}

async function RfpBoardView({ wsId, visibleIds }: { wsId: string; visibleIds: Set<string> }) {
  const board = await loadBoard({ workspaceId: wsId, workspaceType: 'buyer', kind: 'pipeline' });
  const cards = board.cards.filter((c) => visibleIds.has(c.cardId));
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <PipelineBoard cardType="rfp" columns={board.columns} cards={cards} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm tsc --noEmit` → Expected: no errors.
Run: `./node_modules/.bin/eslint app/\(app\)/rfp/page.tsx` → Expected: clean. (RTK `pnpm lint` false-positives on no-var — run eslint直接.)

- [ ] **Step 3: Manual browser verification (record result)**

`pnpm dev`, login as a buyer, visit `/rfp`:
- 표 뷰가 기본. 상태 칩(진행중 등) 클릭 → 표가 필터되고 URL에 `?status=active`.
- 마감 칩(마감임박) + 등급 드롭다운 조합 → AND 필터.
- 칸반 탭 클릭 → 칼럼 보드 표시, 필터된 카드만 보임, URL `?view=board`, 새로고침해도 유지.
- 다른 페이지 갔다 `/rfp` 재진입 → 마지막 뷰(쿠키) 유지.
- 기존 딥링크 `/rfp?status=active` 그대로 동작.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/rfp/page.tsx
git commit -m "feat(rfp): 표/칸반 토글 + 인페이지 필터 통합 (buyer)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `/inbox` 페이지 통합 (PG)

> **TDD 면제**: Task 5와 동일 — 조립 + 이미 테스트된 유닛 결선.

**Files:**
- Modify: `app/(app)/inbox/page.tsx` (전체 재작성)

- [ ] **Step 1: Rewrite `app/(app)/inbox/page.tsx`**

```tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { getInvitationRepo } from '@/lib/server/repositories/factory';
import { loadBoard } from '@/lib/server/board/loadBoard';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { InboxList, InboxListSkeleton, type InboxRow } from '@/components/inbox/InboxList';
import { PipelineBoard } from '@/components/board/PipelineBoard';
import { BoardViewToggle } from '@/components/board/BoardViewToggle';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';
import {
  filterInboxRows,
  resolveBoardView,
  type BoardView,
  type BoardFilterParams,
} from '@/lib/server/board/filterRfps';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'new', label: '신규' },
  { value: 'draft', label: '작성중' },
  { value: 'submitted', label: '제출완료' },
  { value: 'closed', label: '마감' },
];
const GRADE_OPTIONS = Object.entries(GRADE_LABELS).map(([value, label]) => ({ value, label }));

type Props = {
  searchParams: Promise<{ status?: string; deadline?: string; grade?: string; view?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/inbox');
  }

  const sp = await searchParams;
  const cookieStore = await cookies();
  const view = resolveBoardView(sp.view, cookieStore.get('inboxBoardView')?.value);

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title="받은 RFP" />
            <InboxListSkeleton />
          </>
        }
      >
        <InboxListPageLoader wsId={session.user.workspaceId} params={sp} view={view} />
      </Suspense>
    </div>
  );
}

async function InboxListPageLoader({
  wsId,
  params,
  view,
}: {
  wsId: string;
  params: BoardFilterParams;
  view: BoardView;
}) {
  const now = new Date();
  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(wsId);

  const allRows: InboxRow[] = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpStatus: rfp.status,
    rfpId: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
    grade: rfp.bizProfile?.grade ? GRADE_LABELS[rfp.bizProfile.grade] : '—',
    gradeRaw: rfp.bizProfile?.grade,
  }));
  const rows = filterInboxRows(allRows, params, now);

  return (
    <>
      <PageHeader title="받은 RFP" count={rows.length} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar statusOptions={STATUS_OPTIONS} gradeOptions={GRADE_OPTIONS} />
        <BoardViewToggle view={view} cookieName="inboxBoardView" tableCount={rows.length} />
      </div>
      {view === 'board' ? (
        <InboxBoardView wsId={wsId} visibleIds={new Set(rows.map((r) => r.invitationId))} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<InboxIcon size={32} />}
          title="조건에 맞는 제안 요청이 없습니다."
          description="필터를 바꾸세요. 구매사가 초대한 RFP가 여기에 표시됩니다."
        />
      ) : (
        <InboxList rows={rows} />
      )}
    </>
  );
}

async function InboxBoardView({ wsId, visibleIds }: { wsId: string; visibleIds: Set<string> }) {
  const board = await loadBoard({ workspaceId: wsId, workspaceType: 'pg', kind: 'pipeline' });
  const cards = board.cards.filter((c) => visibleIds.has(c.cardId));
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <PipelineBoard cardType="invitation" columns={board.columns} cards={cards} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm tsc --noEmit` → Expected: no errors.
Run: `./node_modules/.bin/eslint app/\(app\)/inbox/page.tsx` → Expected: clean.

- [ ] **Step 3: Manual browser verification (record result)**

Login as a PG user, visit `/inbox`: 표/칸반 토글, 상태(신규/작성중/제출완료/마감)·마감·등급 필터, `?view=board` + `inboxBoardView` 쿠키 유지, 기존 `/inbox?status=new` 딥링크 동작.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/inbox/page.tsx
git commit -m "feat(inbox): 표/칸반 토글 + 인페이지 필터 통합 (pg)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 사이드바 정리 — RFP/받은RFP를 단일 링크(top leaf)로

> **왜 단순 제거가 아닌가 (코드 검증됨):** `SidebarSection`은 항상 접기 chevron을 렌더한다. 따라서 `statuses`만 지우면 RFP/받은RFP에 **아무것도 안 접는 chevron**이 남는다(시각 wart). `Sidebar.tsx`는 `top` 항목을 평면 `NavItem`(chevron 없음)으로, `sections`만 `SidebarSection`(chevron)으로 렌더한다. 그래서 RFP/받은RFP를 `top` leaf로 옮기면 홈·알림과 동급의 깔끔한 링크가 된다 — 스펙 §3의 "단일 링크화"와 일치. 설정 섹션은 실제 하위링크(프로필·멤버)가 있으므로 섹션으로 유지(chevron 의미 있음).

**Files:**
- Modify: `lib/nav/nav-config.ts`
- Test: `lib/nav/__tests__/nav-config.test.ts`
- Test: `components/shell/__tests__/Sidebar.test.tsx`
- Test: `components/shell/__tests__/SidebarSection.test.tsx`

> `components/shell/Sidebar.tsx` 와 `components/shell/sidebar/SidebarSection.tsx` 는 **무수정** — Sidebar는 top/sections를 제네릭하게 렌더하고, SidebarSection의 statuses 분기는 합성 섹션 테스트로 계속 커버된다(프로덕션 미사용이나 harmless 유지 — 스펙 결정).

- [ ] **Step 1: Update the nav-config test first (RED)**

In `lib/nav/__tests__/nav-config.test.ts`, replace the entire `describe('getNavConfig — buyer sections')` block with:

```ts
describe('getNavConfig — buyer workspace leaf', () => {
  it('puts RFP (g r) in top, leaves only the settings section', () => {
    const { top, sections } = getNavConfig('buyer');
    const rfp = top.find((i) => i.id === 'rfp');
    expect(rfp?.label).toBe('RFP');
    expect(rfp?.href).toBe('/rfp');
    expect(rfp?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'r' });
    expect(top.some((i) => i.id === 'inbox')).toBe(false);
    expect(sections.map((s) => s.id)).toEqual(['settings']);
  });
});
```

And replace the entire `describe('getNavConfig — pg sections')` block with:

```ts
describe('getNavConfig — pg workspace leaf', () => {
  it('puts 받은 RFP (g i) in top, no RFP, only the settings section', () => {
    const { top, sections } = getNavConfig('pg');
    const inbox = top.find((i) => i.id === 'inbox');
    expect(inbox?.label).toBe('받은 RFP');
    expect(inbox?.href).toBe('/inbox');
    expect(inbox?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'i' });
    expect(top.some((i) => i.id === 'rfp')).toBe(false);
    expect(sections.map((s) => s.id)).toEqual(['settings']);
  });
});
```

(Leave `getNavConfig — top items`, `getNavConfig — settings section`, `getBreadcrumbSegments`, and `getChordMap` blocks unchanged — chords and breadcrumb behavior are preserved.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/nav/__tests__/nav-config.test.ts`
Expected: FAIL — `rfp`/`inbox` are still in `sections` (not `top`); `top.find(id==='rfp')` is `undefined`, `sections.map` is `['rfp','settings']`.

- [ ] **Step 3: Move the workspace entry from sections to top**

In `lib/nav/nav-config.ts`:

1. Delete the now-unused `statusItems` helper (eslint/knip would flag it):
```ts
function statusItems(base: '/rfp' | '/inbox'): NavStatusItem[] {
  return Object.entries(STATUS_LABELS[base]).map(([status, label]) => ({
    status,
    label,
  }));
}
```

2. Replace the body of `getNavConfig` (the `workspaceSection` const + return) with:
```ts
export function getNavConfig(workspaceType: WorkspaceType): NavConfig {
  const workspaceLeaf: NavLeaf =
    workspaceType === 'buyer'
      ? {
          id: 'rfp',
          label: 'RFP',
          href: '/rfp',
          icon: FileTextIcon,
          shortcut: { kind: 'chord', lead: 'g', key: 'r' },
        }
      : {
          id: 'inbox',
          label: '받은 RFP',
          href: '/inbox',
          icon: InboxIcon,
          shortcut: { kind: 'chord', lead: 'g', key: 'i' },
        };

  return { top: [...TOP, workspaceLeaf], sections: [SETTINGS_SECTION] };
}
```

Keep `STATUS_LABELS` (used by `getBreadcrumbSegments`), `NavStatusItem`, and the `statuses?`/`base?` fields on `NavSection` (harmless; type union `id: 'rfp' | 'inbox' | 'settings'` stays so synthetic sections in tests remain valid).

- [ ] **Step 4: Run nav-config test to verify green**

Run: `pnpm test lib/nav/__tests__/nav-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix Sidebar.test.tsx (RFP/받은RFP now flat leaves)**

In `components/shell/__tests__/Sidebar.test.tsx`, replace:
```ts
  it('renders the RFP section header as a navigable link plus status items', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: 'RFP' })).toHaveAttribute('href', '/rfp');
    expect(screen.getByRole('link', { name: '진행중' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '계약완료' })).toBeInTheDocument();
  });
```
with:
```ts
  it('renders RFP as a top nav link without status sub-items', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: 'RFP' })).toHaveAttribute('href', '/rfp');
    expect(screen.queryByRole('link', { name: '진행중' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '계약완료' })).not.toBeInTheDocument();
  });
```
And replace:
```ts
  it('renders the 받은 RFP section header as a link plus status items', () => {
    renderSidebar(pgProps);
    expect(screen.getByRole('link', { name: '받은 RFP' })).toHaveAttribute('href', '/inbox');
    expect(screen.getByRole('link', { name: '제출완료' })).toBeInTheDocument();
  });
```
with:
```ts
  it('renders 받은 RFP as a top nav link without status sub-items', () => {
    renderSidebar(pgProps);
    expect(screen.getByRole('link', { name: '받은 RFP' })).toHaveAttribute('href', '/inbox');
    expect(screen.queryByRole('link', { name: '제출완료' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Fix SidebarSection.test.tsx (source the status section synthetically)**

`SidebarSection` still supports `statuses`; the test must stop sourcing the RFP section from `getNavConfig` (it's now a top leaf). In `components/shell/__tests__/SidebarSection.test.tsx`, add the type import near the other imports:
```ts
import type { NavSection } from '@/lib/nav/nav-config';
```
Then replace:
```ts
const rfpSection = getNavConfig('buyer').sections.find((s) => s.id === 'rfp')!;
```
with a synthetic section (keeps the status-rendering branch covered):
```ts
const rfpSection: NavSection = {
  id: 'rfp',
  label: 'RFP',
  href: '/rfp',
  base: '/rfp',
  statuses: [
    { status: 'draft', label: '작성중' },
    { status: 'active', label: '진행중' },
    { status: 'closed', label: '마감' },
    { status: 'awarded', label: '계약완료' },
  ],
};
```
(Leave `settingsSection = getNavConfig('buyer').sections.find((s) => s.id === 'settings')!` and all the existing `it(...)` assertions unchanged — the synthetic section's status hrefs (`/rfp?status=draft`, `/rfp?status=active`) match the existing expectations.)

- [ ] **Step 7: Full check + commit**

Run: `pnpm test --project=unit-jsdom components/shell lib/nav` → Expected: PASS.
Run: `pnpm tsc --noEmit` → Expected: no errors.
Run: `./node_modules/.bin/eslint lib/nav/nav-config.ts components/shell/__tests__/Sidebar.test.tsx components/shell/__tests__/SidebarSection.test.tsx` → Expected: clean (no unused `statusItems`, no unused `getNavConfig` import in SidebarSection.test since `settingsSection` still uses it).

```bash
git add lib/nav/nav-config.ts lib/nav/__tests__/nav-config.test.ts components/shell/__tests__/Sidebar.test.tsx components/shell/__tests__/SidebarSection.test.tsx
git commit -m "refactor(nav): RFP/받은RFP를 사이드바 top 링크로 (상태 하위항목 제거)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (whole-plan)

- [ ] `pnpm test` → all green.
- [ ] `pnpm tsc --noEmit` → clean.
- [ ] `./node_modules/.bin/eslint .` → clean (RTK `pnpm lint` no-var false positive).
- [ ] 수동: buyer `/rfp` + pg `/inbox` 양쪽에서 표↔칸반 토글, 3종 필터 AND, URL/쿠키 지속, 기존 `?status=` 딥링크 동작.

## Self-Review notes (spec ↔ plan)

- 스펙 §2(보드 토글+필터, 단일 필터 소스, 뷰 전용 칸반 필터) → Task 1–6.
- 스펙 §2 URL 하위호환(`?status=` 재사용) → `filterRfps`/`filterInboxRows`가 `filterRfpsByParam`/`filterInboxRowsByParam` 위임.
- 스펙 §2 뷰 쿠키(페이지별) → `rfpBoardView`/`inboxBoardView` (Task 3,5,6).
- 스펙 §3(사이드바 "단일 링크화") → Task 7: RFP/받은RFP를 `top` leaf로 이동(chevron 없는 평면 링크), 설정만 섹션 유지. `Sidebar.tsx`/`SidebarSection.tsx` 무수정, 영향 테스트 3개(nav-config·Sidebar·SidebarSection) 정밀 수정 포함.
- 스펙 §5 DnD×필터 회귀 → 코드 검증 결과 칸반이 카드 위치를 저장하지 않으므로(컬럼만 이동, 순서는 `loadBoard` 재계산) 순서 손상 불가. 별도 회귀 테스트 불필요 — 대신 본 Architecture에 근거 명시. (필터는 카드 배열 사전 필터만; `KanbanBoard` 무수정.)
- 스펙 §5 등급 필터 → P2 강등 철회, Task 1·2·4에 동격 포함.
- 범위 밖(홈 대시보드, bidCount) → Plan 2.
