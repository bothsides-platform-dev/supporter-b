# Buyer Home Onboarding Action List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sent` RFP가 없는 신규 구매사 홈 화면에서 빈 상태 대신 배너 CTA + 보조 리스트 형태의 온보딩 액션 목록을 표시한다.

**Architecture:** `buildBuyerDashboard`에 `onboardingActions: OnboardingAction[] | null` 필드를 추가하고 `sent.length === 0`일 때 3개 고정 액션을 반환한다. `HomeDashboard`는 기존 2단 분기(ActionQueue / EmptyState)를 3단(ActionQueue / OnboardingActionList / EmptyState)으로 확장하고, 새 `OnboardingActionList` 컴포넌트가 배너 + 리스트를 렌더링한다.

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind v4, Vitest + @testing-library/react

---

## File Map

| 파일 | 변경 종류 | 역할 |
|---|---|---|
| `lib/server/dashboard/buildDashboard.ts` | 수정 | `OnboardingAction` 타입 추가, `Dashboard.onboardingActions` 필드 추가, `buildBuyerDashboard` + `buildPgDashboard` 반환값 업데이트 |
| `lib/server/dashboard/__tests__/buildDashboard.test.ts` | 수정 | 온보딩 케이스 3개 추가 |
| `components/home/OnboardingActionList.tsx` | 신규 | 배너 CTA + 보조 리스트 컴포넌트 |
| `components/home/__tests__/OnboardingActionList.test.tsx` | 신규 | OnboardingActionList 단위 테스트 |
| `components/home/HomeDashboard.tsx` | 수정 | 3단 조건부 렌더링 + OnboardingActionList import |
| `components/home/__tests__/HomeDashboard.test.tsx` | 수정 | 기존 fixture에 `onboardingActions: null` 추가, 온보딩 케이스 테스트 추가 |

---

## Task 1: 데이터 레이어 — 타입 + 빌더 + 기존 fixture 수정

**Files:**
- Modify: `lib/server/dashboard/buildDashboard.ts`
- Modify: `lib/server/dashboard/__tests__/buildDashboard.test.ts`
- Modify: `components/home/__tests__/HomeDashboard.test.tsx` (TypeScript 컴파일 오류 fix)

- [ ] **Step 1: 새 테스트 케이스 작성 (RED)**

`lib/server/dashboard/__tests__/buildDashboard.test.ts` 맨 아래에 추가:

```ts
describe('buildBuyerDashboard — onboarding', () => {
  it('returns onboardingActions when there are no sent RFPs', () => {
    const dash = buildBuyerDashboard([], new Map(), NOW);
    expect(dash.onboardingActions).not.toBeNull();
    expect(dash.onboardingActions).toHaveLength(3);
    expect(dash.onboardingActions![0].id).toBe('create-rfp');
    expect(dash.onboardingActions![0].href).toBe('/rfp/new');
  });

  it('returns null when sent RFPs exist', () => {
    const sentRfps = [rfp({ id: 'X', status: 'sent', deadline: fromNow(10), sentAt: fromNow(-1) })];
    const dash = buildBuyerDashboard(sentRfps, new Map([['X', 0]]), NOW);
    expect(dash.onboardingActions).toBeNull();
  });

  it('returns onboardingActions when only draft RFPs exist (no sent)', () => {
    const draftOnly = [rfp({ id: 'D', status: 'draft', deadline: fromNow(10) })];
    const dash = buildBuyerDashboard(draftOnly, new Map(), NOW);
    expect(dash.onboardingActions).not.toBeNull();
  });
});

describe('buildPgDashboard — onboarding', () => {
  it('always returns onboardingActions: null', () => {
    const dash = buildPgDashboard([], NOW);
    expect(dash.onboardingActions).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 RED인지 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/dashboard/__tests__/buildDashboard.test.ts
```

Expected: `dash.onboardingActions` is undefined → 테스트 4개 FAIL

- [ ] **Step 3: `OnboardingAction` 타입과 `Dashboard` 필드 추가**

`lib/server/dashboard/buildDashboard.ts` — 기존 타입 선언 블록에 추가:

```ts
export type OnboardingAction = {
  id: string;
  href: string;
  title: string;
  description: string;
};
```

`Dashboard` 타입을 아래로 교체:

```ts
export type Dashboard = { kpis: DashboardKpi[]; groups: ActionGroup[]; onboardingActions: OnboardingAction[] | null };
```

- [ ] **Step 4: `buildBuyerDashboard` — BUYER_ONBOARDING_ACTIONS 상수 + 반환값 변경**

파일 상단(함수 선언 위)에 상수 추가:

```ts
const BUYER_ONBOARDING_ACTIONS: OnboardingAction[] = [
  { id: 'create-rfp',     href: '/rfp/new',          title: '첫 RFP를 작성해 보세요',  description: 'PG사를 초대하고 수수료 견적을 비교할 수 있어요' },
  { id: 'setup-profile',  href: '/settings/profile', title: '워크스페이스 프로필 설정', description: '' },
  { id: 'invite-members', href: '/settings/members', title: '팀원 초대하기',            description: '' },
];
```

`buildBuyerDashboard` 반환문 교체 (기존 `return { kpis, groups };` →):

```ts
  return {
    kpis,
    groups,
    onboardingActions: sent.length === 0 ? BUYER_ONBOARDING_ACTIONS : null,
  };
```

- [ ] **Step 5: `buildPgDashboard` 반환값 변경**

`buildPgDashboard` 반환문 교체 (기존 `return { kpis, groups };` →):

```ts
  return { kpis, groups, onboardingActions: null };
```

- [ ] **Step 6: `HomeDashboard.test.tsx` fixture 컴파일 오류 수정**

`components/home/__tests__/HomeDashboard.test.tsx` — `withGroups`와 `empty` fixture에 `onboardingActions: null` 추가:

```ts
const withGroups: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 8, href: '/rfp?status=active' }],
  groups: [{ id: 'due', label: '마감 임박', items: [{ id: 'P-A', href: '/rfp/P-A', title: 'A', badge: 'D-3' }] }],
  onboardingActions: null,
};

const empty: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 0, href: '/rfp?status=active' }],
  groups: [],
  onboardingActions: null,
};
```

- [ ] **Step 7: 테스트가 GREEN인지 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/dashboard/__tests__/buildDashboard.test.ts
```

Expected: 전체 PASS (기존 + 신규 4개)

- [ ] **Step 8: 전체 테스트 GREEN 확인 (컴파일 오류 없음 포함)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```

Expected: 전체 PASS

- [ ] **Step 9: 커밋**

```bash
git add lib/server/dashboard/buildDashboard.ts \
        lib/server/dashboard/__tests__/buildDashboard.test.ts \
        components/home/__tests__/HomeDashboard.test.tsx
git commit -m "feat(dashboard): onboardingActions 필드 추가 — sent RFP 없을 때 온보딩 액션 3개 반환"
```

---

## Task 2: OnboardingActionList 컴포넌트

**Files:**
- Create: `components/home/__tests__/OnboardingActionList.test.tsx`
- Create: `components/home/OnboardingActionList.tsx`

- [ ] **Step 1: 테스트 파일 작성 (RED)**

`components/home/__tests__/OnboardingActionList.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { OnboardingActionList } from '../OnboardingActionList';
import type { OnboardingAction } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const actions: OnboardingAction[] = [
  { id: 'create-rfp',     href: '/rfp/new',          title: '첫 RFP를 작성해 보세요',  description: 'PG사를 초대하고 수수료 견적을 비교할 수 있어요' },
  { id: 'setup-profile',  href: '/settings/profile', title: '워크스페이스 프로필 설정', description: '' },
  { id: 'invite-members', href: '/settings/members', title: '팀원 초대하기',            description: '' },
];

describe('OnboardingActionList', () => {
  it('renders primary action as a banner with href /rfp/new', () => {
    render(<OnboardingActionList actions={actions} />);
    const banner = screen.getByRole('link', { name: /첫 RFP를 작성해 보세요/ });
    expect(banner).toHaveAttribute('href', '/rfp/new');
    expect(banner).toHaveTextContent('RFP 작성하기');
  });

  it('renders secondary actions as list items with correct hrefs', () => {
    render(<OnboardingActionList actions={actions} />);
    expect(screen.getByRole('link', { name: /워크스페이스 프로필 설정/ }))
      .toHaveAttribute('href', '/settings/profile');
    expect(screen.getByRole('link', { name: /팀원 초대하기/ }))
      .toHaveAttribute('href', '/settings/members');
  });

  it('renders nothing when actions array is empty', () => {
    const { container } = render(<OnboardingActionList actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: 테스트가 RED인지 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/home/__tests__/OnboardingActionList.test.tsx
```

Expected: `Cannot find module '../OnboardingActionList'` — FAIL

- [ ] **Step 3: 컴포넌트 구현**

`components/home/OnboardingActionList.tsx` 신규 생성:

```tsx
import Link from 'next/link';
import type { OnboardingAction } from '@/lib/server/dashboard/buildDashboard';

export function OnboardingActionList({ actions }: { actions: OnboardingAction[] }) {
  if (actions.length === 0) return null;

  const [primary, ...secondary] = actions;

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={primary.href}
        className="flex items-center justify-between gap-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-primary-container)] bg-[var(--md-sys-color-primary-container)] px-4 py-3.5 transition-colors hover:brightness-95"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-[var(--md-sys-color-on-primary-container)]">
            {primary.title}
          </span>
          {primary.description && (
            <span className="text-[12px] text-[var(--md-sys-color-on-primary-container)] opacity-70">
              {primary.description}
            </span>
          )}
        </div>
        <span className="shrink-0 rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[13px] font-medium text-white">
          RFP 작성하기
        </span>
      </Link>
      {secondary.length > 0 && (
        <ul className="flex flex-col">
          {secondary.map((action) => (
            <li key={action.id}>
              <Link
                href={action.href}
                className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-2.5 text-[14px] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
              >
                <span className="text-[var(--md-sys-color-on-surface)]">{action.title}</span>
                <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트가 GREEN인지 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/home/__tests__/OnboardingActionList.test.tsx
```

Expected: 3개 PASS

- [ ] **Step 5: 커밋**

```bash
git add components/home/OnboardingActionList.tsx \
        components/home/__tests__/OnboardingActionList.test.tsx
git commit -m "feat(home): OnboardingActionList 컴포넌트 추가 — 배너 CTA + 보조 리스트"
```

---

## Task 3: HomeDashboard 3단 분기 연결

**Files:**
- Modify: `components/home/HomeDashboard.tsx`
- Modify: `components/home/__tests__/HomeDashboard.test.tsx`

- [ ] **Step 1: 새 테스트 케이스 작성 (RED)**

`components/home/__tests__/HomeDashboard.test.tsx` — `withGroups`, `empty` 아래에 fixture + 테스트 추가:

```ts
const withOnboarding: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 0, href: '/rfp?status=active' }],
  groups: [],
  onboardingActions: [
    { id: 'create-rfp',     href: '/rfp/new',          title: '첫 RFP를 작성해 보세요',  description: 'PG사를 초대하고 수수료 견적을 비교할 수 있어요' },
    { id: 'setup-profile',  href: '/settings/profile', title: '워크스페이스 프로필 설정', description: '' },
    { id: 'invite-members', href: '/settings/members', title: '팀원 초대하기',            description: '' },
  ],
};
```

`describe('HomeDashboard')` 블록 안에 추가:

```ts
  it('shows OnboardingActionList when groups is empty and onboardingActions is set', () => {
    render(<HomeDashboard dashboard={withOnboarding} workspaceType="buyer" />);
    expect(screen.getByRole('link', { name: /첫 RFP를 작성해 보세요/ }))
      .toHaveAttribute('href', '/rfp/new');
    expect(screen.getByRole('link', { name: /워크스페이스 프로필 설정/ }))
      .toHaveAttribute('href', '/settings/profile');
    expect(screen.queryByText('지금 처리할 일이 없습니다')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트가 RED인지 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/home/__tests__/HomeDashboard.test.tsx
```

Expected: 새 케이스 FAIL (`getByRole` → 없는 링크로 throw)

- [ ] **Step 3: HomeDashboard 3단 분기 구현**

`components/home/HomeDashboard.tsx` — 상단 import에 추가:

```ts
import { OnboardingActionList } from './OnboardingActionList';
```

조건부 렌더링 블록 교체 (기존 2단 분기 →):

```tsx
        {dashboard.groups.length > 0 ? (
          <ActionQueue groups={dashboard.groups} />
        ) : dashboard.onboardingActions ? (
          <OnboardingActionList actions={dashboard.onboardingActions} />
        ) : (
          <EmptyState
            icon={<CheckIcon />}
            title="지금 처리할 일이 없습니다"
            description={EMPTY_DESC[workspaceType]}
          />
        )}
```

- [ ] **Step 4: 테스트가 GREEN인지 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/home/__tests__/HomeDashboard.test.tsx
```

Expected: 3개 모두 PASS

- [ ] **Step 5: 전체 테스트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```

Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add components/home/HomeDashboard.tsx \
        components/home/__tests__/HomeDashboard.test.tsx
git commit -m "feat(home): buyer 홈 온보딩 액션 리스트 연결 — sent RFP 없을 때 배너 CTA 표시"
```
