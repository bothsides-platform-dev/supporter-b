# 온보딩 시작점을 홈 화면으로 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "샘플로 둘러보기" 온보딩 진입 카드(`SampleEntryCard`)를 목록 페이지(`/rfp`, `/inbox`)에서 홈 화면(`/home`)으로 이동한다.

**Architecture:** 기존에 `/rfp`, `/inbox` 페이지 로더가 각자 수행하던 `getOnboarding` 조회 + `shouldShowSampleEntry` 판정을 `BuyerHome`/`PgHome`(홈 화면의 워크스페이스별 서버 컴포넌트)로 옮기고, 결과를 `showSampleEntry: boolean` prop으로 `HomeDashboard`에 전달한다. `HomeDashboard`는 이 값이 true일 때 `SampleEntryCard`를 KPI strip과 ActionQueue 사이(버이어는 "견적 요청하기" CTA 다음)에 렌더한다. `SampleEntryCard` 컴포넌트 자체, 샘플 딜룸 라우트, `updateOnboardingAction`, `users.onboarding` 스키마는 변경하지 않는다.

**Tech Stack:** Next.js App Router(서버 컴포넌트), React 19, Vitest + @testing-library/react, TypeScript strict.

## Global Constraints

- 모든 코드 변경은 RED → GREEN 순서로 진행한다 (테스트 먼저 작성해 실패를 확인한 뒤 구현). `CLAUDE.md` TDD 하드룰.
- 온보딩 진입 카드는 홈 화면에만 노출한다 — `/rfp`, `/inbox`에는 더 이상 노출하지 않는다(중복 노출 없음).
- `SampleEntryCard`, `shouldShowSampleEntry`, `getOnboarding`, `users.onboarding` jsonb 구조, 샘플 딜룸 라우트(`/rfp/sample`, `/inbox/sample`)는 변경하지 않는다.
- 배치 순서: KPI strip → (buyer만) "견적 요청하기" CTA → `SampleEntryCard`(showSampleEntry일 때만) → ActionQueue/EmptyState.
- 각 태스크 끝에 `pnpm test <path>`로 해당 파일 그린 확인 후 커밋한다.

---

### Task 1: `HomeDashboard`에 `showSampleEntry` prop과 `SampleEntryCard` 렌더 추가

**Files:**
- Modify: `components/home/HomeDashboard.tsx`
- Test: `components/home/__tests__/HomeDashboard.test.tsx`

**Interfaces:**
- Consumes: 기존 `SampleEntryCard` (`components/onboarding/SampleEntryCard.tsx`) — `variant: 'buyer' | 'pg'` prop, 이미 완성된 컴포넌트. 변경 없음.
- Produces: `HomeDashboard`가 새 prop `showSampleEntry?: boolean`(기본값 없을 시 falsy로 취급)을 받는다 — Task 2에서 `BuyerHome`/`PgHome`이 이 prop을 채워 넘긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`components/home/__tests__/HomeDashboard.test.tsx` 파일 끝(마지막 `});` 앞)에 아래 테스트들을 추가한다:

```tsx
  it('showSampleEntry=true인 buyer는 CTA 다음, ActionQueue 이전에 SampleEntryCard(variant=buyer)를 렌더한다', () => {
    render(
      <HomeDashboard
        dashboard={withGroups}
        workspaceType="buyer"
        items={[]}
        unreadCount={0}
        showSampleEntry
      />,
    );
    const cta = screen.getByRole('link', { name: /견적 요청하기/ });
    const sample = screen.getByText('샘플로 둘러보기');
    const actionItem = screen.getByRole('link', { name: /A/ });
    expect(sample).toBeInTheDocument();
    expect(cta.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sample.compareDocumentPosition(actionItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('showSampleEntry=true인 pg는 KPI strip 다음에 SampleEntryCard(variant=pg)를 렌더한다', () => {
    render(
      <HomeDashboard
        dashboard={withGroups}
        workspaceType="pg"
        items={[]}
        unreadCount={0}
        showSampleEntry
      />,
    );
    const kpi = screen.getByRole('link', { name: /진행중/ });
    const sample = screen.getByText('샘플로 둘러보기');
    expect(sample).toBeInTheDocument();
    expect(kpi.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 링크의 접근성 이름은 title+description 두 <p>가 합쳐진 전체 텍스트라 정확한 문자열이 아닌
    // 정규식으로 부분 매치한다 (SampleEntryCard 자체 테스트도 이름 매칭 없이 getByRole('link')만 사용).
    expect(screen.getByRole('link', { name: /샘플로 둘러보기/ })).toHaveAttribute('href', '/inbox/sample');
  });

  it('showSampleEntry가 false/미지정이면 SampleEntryCard를 렌더하지 않는다', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" items={[]} unreadCount={0} />);
    expect(screen.queryByText('샘플로 둘러보기')).not.toBeInTheDocument();
  });
```

이 테스트 파일은 이미 `next/navigation`의 `useRouter`를 모킹하고 있으므로(`SampleEntryCard`가 내부에서 사용) 추가 모킹은 필요 없다.

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm test components/home/__tests__/HomeDashboard.test.tsx`
Expected: 새로 추가한 3개 테스트가 FAIL (`showSampleEntry` prop이 존재하지 않아 `getByText('샘플로 둘러보기')`가 못 찾음 / prop 타입 에러 없음 — HomeDashboard가 여분의 prop을 무시하므로 컴파일은 통과하고 텍스트를 못 찾아 실패).

- [ ] **Step 3: 최소 구현**

`components/home/HomeDashboard.tsx`를 다음과 같이 수정한다:

```tsx
import Link from 'next/link';
import { KpiStrip } from './KpiStrip';
import { ActionQueue } from './ActionQueue';
import { RecentMessagesPanel } from './RecentMessagesPanel';
import { HomeHeaderActionsRegistrar } from './HomeHeaderActionsRegistrar';
import { OpportunityList } from '@/components/opportunities/OpportunityList';
import { SampleEntryCard } from '@/components/onboarding/SampleEntryCard';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckIcon, PlusIcon } from '@/components/icons';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';
import type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';

const EMPTY_DESC: Record<'buyer' | 'pg', string> = {
  buyer: '새 견적이 오거나 마감이 다가오면 여기에 표시돼요.',
  pg: '구매사가 초대한 견적 요청이 여기에 표시돼요.',
};

/** 홈 미리보기에서 보여줄 오픈 RFP 최대 개수. 나머지는 /opportunities 전체 보기. */
const HOME_OPEN_RFP_PREVIEW = 5;

export function HomeDashboard({
  dashboard,
  workspaceType,
  items,
  unreadCount,
  showSampleEntry,
}: {
  dashboard: Dashboard;
  workspaceType: 'buyer' | 'pg';
  items: InboxListItem[];
  unreadCount: number;
  showSampleEntry?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <HomeHeaderActionsRegistrar />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <KpiStrip kpis={dashboard.kpis} />
          {/* 샘플 견적이 액션 큐에 잡혀도 구매사가 새 견적을 만들 수 있도록 /rfp 헤더의
              "견적 요청하기" CTA를 재사용해 상시 노출. KPI strip(선정 완료) 바로 아래에
              풀-width 큰 버튼으로 강조한다. */}
          {workspaceType === 'buyer' && (
            <Link href="/rfp-create" className="block">
              <Button size="lg" fullWidth icon={<PlusIcon />}>견적 요청하기</Button>
            </Link>
          )}
          {showSampleEntry && <SampleEntryCard variant={workspaceType} />}
          {dashboard.groups.length > 0 ? (
            <ActionQueue groups={dashboard.groups} />
          ) : (
            <EmptyState
              icon={<CheckIcon />}
              title="지금 처리할 일이 없습니다"
              description={EMPTY_DESC[workspaceType]}
            />
          )}
          {OPEN_BOARD_ENABLED &&
            workspaceType === 'pg' &&
            dashboard.openRfps != null &&
            dashboard.openRfps.length > 0 && (
              <section>
                <h2 className="mb-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  참여 가능한 견적
                </h2>
                <OpportunityList
                  items={dashboard.openRfps}
                  limit={HOME_OPEN_RFP_PREVIEW}
                  showAllHref="/opportunities"
                />
              </section>
            )}
        </div>
        <div className="lg:w-[360px] lg:shrink-0">
          <RecentMessagesPanel items={items} unreadCount={unreadCount} />
        </div>
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

(변경점: `SampleEntryCard` import 추가, `showSampleEntry` prop 추가, CTA 블록과 `ActionQueue`/`EmptyState` 블록 사이에 `{showSampleEntry && <SampleEntryCard variant={workspaceType} />}` 삽입. `SampleEntryCard`의 `variant` prop 타입이 `'buyer' | 'pg'`로 `workspaceType`과 동일하므로 그대로 전달 가능.)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm test components/home/__tests__/HomeDashboard.test.tsx`
Expected: 전체 PASS (기존 테스트 포함 — `showSampleEntry`를 넘기지 않는 기존 테스트들은 `undefined`이므로 카드가 안 보여 그대로 통과한다).

- [ ] **Step 5: 커밋**

```bash
git add components/home/HomeDashboard.tsx components/home/__tests__/HomeDashboard.test.tsx
git commit -m "feat: HomeDashboard에 온보딩 샘플 엔트리 카드 슬롯 추가"
```

---

### Task 2: `BuyerHome`/`PgHome`이 온보딩 상태를 조회해 `HomeDashboard`에 전달

**Files:**
- Modify: `components/home/BuyerHome.tsx`
- Modify: `components/home/PgHome.tsx`
- Modify: `app/(app)/home/page.tsx`
- Test: `components/home/__tests__/BuyerHome.test.tsx` (신규)
- Test: `components/home/__tests__/PgHome.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 1에서 만든 `HomeDashboard`의 `showSampleEntry?: boolean` prop. `getUserRepo().getOnboarding(userId: string): Promise<UserOnboarding>` (`lib/server/repositories/factory.ts`, `lib/server/repositories/types.ts:537`). `shouldShowSampleEntry(onboarding: UserOnboarding, key: OnboardingKey): boolean` (`lib/onboarding/visibility.ts`).
- Produces: `BuyerHome({ workspaceId, userId }: { workspaceId: string; userId: string })`, `PgHome({ workspaceId, userId }: { workspaceId: string; userId: string })` — 둘 다 새 필수 prop `userId`를 받는다. `app/(app)/home/page.tsx`는 이 두 컴포넌트에 `userId={session.user.id}`를 전달한다.

- [ ] **Step 1: 실패하는 테스트 작성 — `BuyerHome`**

`components/home/__tests__/BuyerHome.test.tsx` 신규 생성:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const { loadBuyerDashboardMock } = vi.hoisted(() => ({ loadBuyerDashboardMock: vi.fn() }));
vi.mock('@/lib/server/dashboard/loadDashboard', () => ({
  loadBuyerDashboard: loadBuyerDashboardMock,
}));

const { listInboxForViewerMock } = vi.hoisted(() => ({ listInboxForViewerMock: vi.fn() }));
vi.mock('@/lib/server/actions/chat/inboxLoader', () => ({
  listInboxForViewer: listInboxForViewerMock,
}));

const { getOnboardingMock } = vi.hoisted(() => ({ getOnboardingMock: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getUserRepo: async () => ({ getOnboarding: getOnboardingMock }),
}));

const { homeDashboardPropsSpy } = vi.hoisted(() => ({ homeDashboardPropsSpy: vi.fn() }));
vi.mock('@/components/home/HomeDashboard', () => ({
  HomeDashboard: (props: Record<string, unknown>) => {
    homeDashboardPropsSpy(props);
    return <div>HomeDashboard</div>;
  },
}));

import { BuyerHome } from '../BuyerHome';

beforeEach(() => {
  loadBuyerDashboardMock.mockResolvedValue({ kpis: [], groups: [] });
  listInboxForViewerMock.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BuyerHome', () => {
  it('buyerSample 태스크가 미완료면 showSampleEntry=true를 HomeDashboard에 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1 });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(screen.getByText('HomeDashboard')).toBeInTheDocument();
    expect(getOnboardingMock).toHaveBeenCalledWith('u-1');
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showSampleEntry: true, workspaceType: 'buyer' }),
    );
  });

  it('buyerSample 태스크가 completed면 showSampleEntry=false를 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1, buyerSample: { completedAt: '2026-01-01T00:00:00Z' } });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showSampleEntry: false }),
    );
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm test components/home/__tests__/BuyerHome.test.tsx`
Expected: FAIL — `BuyerHome({ workspaceId, userId })` 호출 시 `getOnboardingMock`이 호출되지 않아(현재 `BuyerHome`은 `getUserRepo`를 쓰지 않음) 두 번째 assertion에서 실패, `homeDashboardPropsSpy`에 `showSampleEntry`가 없어(`undefined`) `objectContaining({ showSampleEntry: true })` 불일치로 실패.

- [ ] **Step 3: 최소 구현 — `BuyerHome`**

`components/home/BuyerHome.tsx` 전체 교체:

```tsx
import { PageEnter } from '@/components/primitives/PageEnter';
import { loadBuyerDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { shouldShowSampleEntry } from '@/lib/onboarding/visibility';

export async function BuyerHome({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [dashboard, allItems, onboarding] = await Promise.all([
    loadBuyerDashboard(workspaceId),
    listInboxForViewer(),
    (await getUserRepo()).getOnboarding(userId),
  ]);
  const { items, unreadCount } = buildHomeMessagesSnapshot(allItems);
  const showSampleEntry = shouldShowSampleEntry(onboarding, 'buyerSample');
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="buyer"
        items={items}
        unreadCount={unreadCount}
        showSampleEntry={showSampleEntry}
      />
    </PageEnter>
  );
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm test components/home/__tests__/BuyerHome.test.tsx`
Expected: PASS

- [ ] **Step 5: 실패하는 테스트 작성 — `PgHome`**

`components/home/__tests__/PgHome.test.tsx` 신규 생성 (BuyerHome 테스트와 대칭, `loadPgDashboard`/`pgSample`/`workspaceType: 'pg'` 사용):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const { loadPgDashboardMock } = vi.hoisted(() => ({ loadPgDashboardMock: vi.fn() }));
vi.mock('@/lib/server/dashboard/loadDashboard', () => ({
  loadPgDashboard: loadPgDashboardMock,
}));

const { listInboxForViewerMock } = vi.hoisted(() => ({ listInboxForViewerMock: vi.fn() }));
vi.mock('@/lib/server/actions/chat/inboxLoader', () => ({
  listInboxForViewer: listInboxForViewerMock,
}));

const { getOnboardingMock } = vi.hoisted(() => ({ getOnboardingMock: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getUserRepo: async () => ({ getOnboarding: getOnboardingMock }),
}));

const { homeDashboardPropsSpy } = vi.hoisted(() => ({ homeDashboardPropsSpy: vi.fn() }));
vi.mock('@/components/home/HomeDashboard', () => ({
  HomeDashboard: (props: Record<string, unknown>) => {
    homeDashboardPropsSpy(props);
    return <div>HomeDashboard</div>;
  },
}));

import { PgHome } from '../PgHome';

beforeEach(() => {
  loadPgDashboardMock.mockResolvedValue({ kpis: [], groups: [] });
  listInboxForViewerMock.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PgHome', () => {
  it('pgSample 태스크가 미완료면 showSampleEntry=true를 HomeDashboard에 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1 });
    render(await PgHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(screen.getByText('HomeDashboard')).toBeInTheDocument();
    expect(getOnboardingMock).toHaveBeenCalledWith('u-1');
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showSampleEntry: true, workspaceType: 'pg' }),
    );
  });

  it('pgSample 태스크가 dismissed면 showSampleEntry=false를 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1, pgSample: { dismissedAt: '2026-01-01T00:00:00Z' } });
    render(await PgHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showSampleEntry: false }),
    );
  });
});
```

- [ ] **Step 6: 테스트 실행 → 실패 확인**

Run: `pnpm test components/home/__tests__/PgHome.test.tsx`
Expected: FAIL (동일한 이유로 `PgHome`이 아직 `userId`/`getOnboarding`을 다루지 않음)

- [ ] **Step 7: 최소 구현 — `PgHome`**

`components/home/PgHome.tsx` 전체 교체:

```tsx
import { PageEnter } from '@/components/primitives/PageEnter';
import { loadPgDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { shouldShowSampleEntry } from '@/lib/onboarding/visibility';

export async function PgHome({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [dashboard, allItems, onboarding] = await Promise.all([
    loadPgDashboard(workspaceId),
    listInboxForViewer(),
    (await getUserRepo()).getOnboarding(userId),
  ]);
  const { items, unreadCount } = buildHomeMessagesSnapshot(allItems);
  const showSampleEntry = shouldShowSampleEntry(onboarding, 'pgSample');
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="pg"
        items={items}
        unreadCount={unreadCount}
        showSampleEntry={showSampleEntry}
      />
    </PageEnter>
  );
}
```

- [ ] **Step 8: 테스트 실행 → 통과 확인**

Run: `pnpm test components/home/__tests__/PgHome.test.tsx`
Expected: PASS

- [ ] **Step 9: `app/(app)/home/page.tsx`에서 `userId` 전달**

`app/(app)/home/page.tsx`의 `<PgHome workspaceId={session.user.workspaceId} />`와 `<BuyerHome workspaceId={session.user.workspaceId} />` 호출을 다음과 같이 수정한다:

```tsx
  if (session.user.workspaceType === 'pg' && session.user.workspaceId) {
    return (
      <>
        {notice === 'pg-rfp-blocked' && <PgRfpBlockedToast />}
        <Suspense fallback={<div className="px-8 py-10"><HomeDashboardSkeleton /></div>}>
          <PgHome workspaceId={session.user.workspaceId} userId={session.user.id} />
        </Suspense>
      </>
    );
  }

  if (session.user.workspaceType === 'buyer' && session.user.workspaceId) {
    return (
      <Suspense fallback={<div className="px-8 py-10"><HomeDashboardSkeleton /></div>}>
        <BuyerHome workspaceId={session.user.workspaceId} userId={session.user.id} />
      </Suspense>
    );
  }
```

(파일의 나머지 부분은 변경하지 않는다.)

- [ ] **Step 10: 관련 스위트 전체 실행 → 통과 확인**

Run: `pnpm test components/home app/\(app\)/home`
Expected: 모두 PASS (기존 `page.test.tsx`는 `BuyerHome`/`PgHome`을 통째로 모킹하므로 새 `userId` prop과 무관하게 그대로 통과)

- [ ] **Step 11: 커밋**

```bash
git add components/home/BuyerHome.tsx components/home/PgHome.tsx components/home/__tests__/BuyerHome.test.tsx components/home/__tests__/PgHome.test.tsx "app/(app)/home/page.tsx"
git commit -m "feat: BuyerHome/PgHome이 온보딩 상태를 조회해 홈 화면에 샘플 카드를 노출"
```

---

### Task 3: `/rfp`, `/inbox` 목록 페이지에서 온보딩 카드 제거

**Files:**
- Modify: `app/(app)/rfp/page.tsx`
- Modify: `app/(app)/inbox/page.tsx`

**Interfaces:**
- Consumes: 없음 (제거 작업).
- Produces: 없음 — 두 페이지의 공개 인터페이스(export, prop)는 변경되지 않는다. `RfpListPageLoader`/`InboxListPageLoader`의 `userId` prop은 다른 용도로 쓰이지 않으므로 함께 제거한다.

이 두 파일에는 온보딩 카드에 대한 기존 자동 테스트가 없다(확인됨: `app/(app)/rfp/__tests__`, `app/(app)/inbox/__tests__` 디렉터리 없음). 순수 삭제 작업이라 새 테스트를 추가하지 않는다 — 삭제 후 `pnpm tsc --noEmit`으로 미사용 import/변수가 없는지 타입 검증한다.

- [ ] **Step 1: `app/(app)/rfp/page.tsx` 수정**

아래처럼 변경한다:

1. import 구역에서 제거:
```tsx
import { SampleEntryCard } from '@/components/onboarding/SampleEntryCard';
import { shouldShowSampleEntry } from '@/lib/onboarding/visibility';
```
`getUserRepo` import는 다른 곳에서 안 쓰이면 `getRfpRepo`만 남기고 제거한다 — 파일 상단을:
```tsx
import { getRfpRepo, getUserRepo } from '@/lib/server/repositories/factory';
```
에서
```tsx
import { getRfpRepo } from '@/lib/server/repositories/factory';
```
로 바꾼다.

2. `RfpListPage`의 `<RfpListPageLoader wsId={wsId} userId={session.user.id} params={sp} view={view} newRfpAction={newRfpAction} />` 호출에서 `userId={session.user.id}`를 제거:
```tsx
<RfpListPageLoader wsId={wsId} params={sp} view={view} newRfpAction={newRfpAction} />
```

3. `RfpListPageLoader` 함수 시그니처에서 `userId` 파라미터 제거:
```tsx
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
  const rfps = filterRfps(allRfps, paramsForView(params, view), now);

  // 행 클릭은 딜룸 모달(인터셉트 라우트)을 띄운다 — 과거 ?peek 사이드 패널은 제거됨.
  const listContent =
    rfps.length === 0 ? (
      <div className="space-y-4 px-6 pt-4">
        <EmptyState
          icon={<FileTextIcon size={32} />}
          title="아직 보낸 견적 요청이 없어요."
          description="필터를 바꾸거나 첫 견적 요청을 보내보세요."
        />
      </div>
    ) : view === 'board' ? (
      <RfpBoardView wsId={wsId} visibleIds={new Set(rfps.map((r) => r.id))} />
    ) : (
      <RfpListTable rfps={rfps} />
    );

  return (
    <>
      <PageHeader title="견적 요청" count={rfps.length} action={newRfpAction} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar
          statusOptions={STATUS_OPTIONS}
          gradeOptions={GRADE_OPTIONS}
          hideStatus={view === 'board'}
        />
        <BoardViewToggle view={view} cookieName="rfpBoardView" tableCount={rfps.length} />
      </div>
      {listContent}
    </>
  );
}
```

- [ ] **Step 2: `app/(app)/inbox/page.tsx` 수정**

동일한 방식으로:

1. import 제거:
```tsx
import { SampleEntryCard } from '@/components/onboarding/SampleEntryCard';
import { shouldShowSampleEntry } from '@/lib/onboarding/visibility';
import { getUserRepo } from '@/lib/server/repositories/factory';
```
(이 파일은 `getUserRepo`만 이 import 줄에 있으므로 줄 전체를 삭제한다.)

2. `InboxPage`의 호출을:
```tsx
<InboxListPageLoader wsId={session.user.workspaceId} params={sp} view={view} />
```
로 바꾼다(`userId={session.user.id}` 제거).

3. `InboxListPageLoader` 시그니처와 본문을:
```tsx
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
  // 3-쿼리 조립의 단일 출처 — pgInboxDataToRows·buildPgPipelineCards 양쪽이 동일 데이터 소비.
  const pgData = await loadPgInboxData(wsId);
  const allRows = pgInboxDataToRows(pgData);
  const rows = filterInboxRows(allRows, paramsForView(params, view), now);

  // 행 클릭은 딜룸 모달(인터셉트 라우트)을 띄운다 — 과거 ?peek 사이드 패널은 제거됨.
  const listContent =
    rows.length === 0 ? (
      <div className="space-y-4 px-6 pt-4">
        <EmptyState
          icon={<InboxIcon size={32} />}
          title="아직 받은 견적 요청이 없어요."
          description="필터를 바꾸면 견적 요청을 볼 수 있어요. 구매사가 초대한 견적 요청이 여기에 표시돼요."
        />
      </div>
    ) : view === 'board' ? (
      <InboxBoardView
        wsId={wsId}
        visibleIds={new Set(rows.map((r) => r.invitationId))}
        pgData={pgData}
      />
    ) : (
      <InboxList rows={rows} />
    );

  return (
    <>
      <PageHeader title="받은 견적 요청" count={rows.length} />
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar
          statusOptions={STATUS_OPTIONS}
          gradeOptions={GRADE_OPTIONS}
          hideStatus={view === 'board'}
        />
        <BoardViewToggle view={view} cookieName="inboxBoardView" tableCount={rows.length} />
      </div>
      {listContent}
    </>
  );
}
```

- [ ] **Step 3: 타입체크로 미사용 import/변수 검증**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음(0 errors). 특히 `userId`/`getUserRepo`/`SampleEntryCard`/`shouldShowSampleEntry` 관련 미사용 변수 에러가 없어야 한다.

- [ ] **Step 4: 두 페이지 관련 스위트 + 린트 실행**

Run: `pnpm lint`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/rfp/page.tsx" "app/(app)/inbox/page.tsx"
git commit -m "refactor: 목록 페이지에서 온보딩 샘플 카드 제거 (홈으로 이동 완료)"
```

---

### Task 4: 전체 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `pnpm test`
Expected: 전체 PASS. (프로젝트 메모리상 알려진 선존재 실패가 있다면 — 예: PG-landing 관련 1건 — 이번 변경과 무관함을 diff로 확인하고 넘어간다.)

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 둘 다 통과.

- [ ] **Step 3: 수동 확인 (선택, 로컬 dev 서버가 있다면)**

`pnpm dev`로 로컬 서버를 띄우고, 온보딩 미완료 buyer/pg 계정으로 `/home` 접속 시 KPI strip과 ActionQueue 사이에 "샘플로 둘러보기" 카드가 보이는지, `/rfp`·`/inbox`에는 더 이상 카드가 없는지 육안 확인한다. 카드 클릭 시 샘플 딜룸으로 이동하는지, X(숨기기) 클릭 시 카드가 사라지고 새로고침해도 다시 안 뜨는지 확인한다.

- [ ] **Step 4: 최종 커밋 없음 — 이 태스크는 검증 전용이며 코드 변경이 없으므로 커밋하지 않는다.**
