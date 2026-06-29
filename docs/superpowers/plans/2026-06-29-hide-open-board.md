# 오픈게시판 임시 숨김 (kill switch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG 오픈게시판(발견 보드)을 단일 플래그 상수 하나로 프론트에서 임시로 숨긴다 — 데이터/서버 불변, 다시 켜기는 상수 한 줄 변경.

**Architecture:** `lib/features/open-board.ts`의 `OPEN_BOARD_ENABLED` 단일 상수(SSOT)를 모든 노출 surface(사이드바·홈 탐색·`/opportunities`·커맨드팔레트·작성 위저드 체크박스·RFP 상세 칩)가 참조한다. UI-only 차단 — 서버 액션·쿼리·DB는 그대로. 드리프트 가드 테스트가 surface 누락을 막는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest 4 + RTL/jsdom, Tailwind v4.

## Global Constraints

- **TDD 필수** (CLAUDE.md Iron Law): RED → GREEN → REFACTOR. 구현 전 실패 테스트 먼저. 순수 설정 상수(Task 1)만 예외.
- **플래그 타입은 `: boolean` 명시** — `false` 리터럴로 좁혀지면 분기가 dead-code 취급되어 lint 에러. 반드시 `export const OPEN_BOARD_ENABLED: boolean = false;`
- **off-branch 테스트는 모킹 불필요** — 출고 기본값이 `false`라 실제 모듈 그대로 사용. **기존 "board-on" 테스트만** 파일 상단에 `vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }))` 한 줄 추가해 커버 보존.
- **플래그는 호출 시점에 읽는다** — 모듈 top-level이 아니라 함수/렌더 본문에서 참조(테스트 가능성 + 일관성).
- **UI-only 범위 엄수** — 서버 액션(`createPgRequestAction`·`searchEntitiesAction`)·repo(`findOpenRfpsForPg`)·DB 스키마·`RfpPendingRequests`는 건드리지 않는다.
- 검증: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test <path>`. 워크트리 LSP 거짓 진단 무시 — fresh tsc/test가 진실.
- 커밋 메시지: 한국어 conventional commit. worktree 브랜치이므로 자유롭게 커밋.

## File Structure

**생성:**
- `lib/features/open-board.ts` — 플래그 SSOT (Task 1)
- `components/opportunities/OpportunitiesUnavailable.tsx` — `/opportunities` 준비중 뷰 (Task 4)
- `lib/nav/__tests__/nav-config.open-board.test.ts` — nav off-branch (Task 2)
- `components/home/__tests__/HomeDashboard.open-board.test.tsx` — 홈 off-branch (Task 3)
- `components/opportunities/__tests__/OpportunitiesUnavailable.test.tsx` — 준비중 뷰 (Task 4)
- `components/shell/__tests__/CommandPalette.open-board.test.tsx` — 팔레트 off-branch (Task 5)
- `components/rfp/__tests__/RfpStep4Review.open-board.test.tsx` — 체크박스 off-branch (Task 6)
- `components/rfp/__tests__/RfpBoardVisibilityStatus.open-board.test.tsx` — 칩 off-branch (Task 7)
- `lib/features/__tests__/open-board-flag.test.ts` — 드리프트 가드 (Task 8)

**수정:**
- `lib/nav/nav-config.ts` (Task 2)
- `lib/nav/__tests__/nav-config.test.ts`, `lib/nav/__tests__/nav-commands.test.ts` (Task 2, on-branch 보존)
- `components/home/HomeDashboard.tsx`, `components/home/__tests__/HomeDashboard.test.tsx` (Task 3)
- `app/(app)/opportunities/page.tsx` (Task 4)
- `components/shell/CommandPalette.tsx`, `components/shell/__tests__/CommandPalette.test.tsx` (Task 5)
- `components/rfp/RfpStep4Review.tsx`, `components/rfp/__tests__/RfpStep4Review.test.tsx` (Task 6)
- `components/rfp/RfpBoardVisibilityStatus.tsx`, `components/rfp/__tests__/RfpBoardVisibilityStatus.test.tsx` (Task 7)

---

### Task 1: 플래그 SSOT 모듈 + 스펙 커밋

**Files:**
- Create: `lib/features/open-board.ts`
- (스펙 문서 `docs/superpowers/specs/2026-06-29-hide-open-board-design.md`, 플랜 `docs/superpowers/plans/2026-06-29-hide-open-board.md` 도 함께 커밋)

**Interfaces:**
- Produces: `export const OPEN_BOARD_ENABLED: boolean` — 모든 surface와 드리프트 가드가 import.

> **TDD 예외:** 순수 설정 상수(CLAUDE.md "순수 설정 파일" 예외). 값 자체를 단언하는 테스트는 만들지 않는다 — 나중에 `true`로 뒤집힐 값이라 brittle. 구조 검증은 Task 8 드리프트 가드가 담당.

- [ ] **Step 1: 플래그 모듈 생성**

`lib/features/open-board.ts`:
```ts
/**
 * 오픈게시판(PG 발견 보드) 임시 kill switch.
 *
 * 다시 켜려면 이 값만 `true` 로 바꿔 배포하세요 — 다른 파일은 손대지 않습니다.
 * UI-only 차단이라 서버 액션·데이터는 그대로 → 켜는 즉시 그동안 만든 RFP 도
 * 자연스럽게 노출됩니다.
 *
 * 새 노출 surface 를 추가할 때 이 플래그를 반드시 참조하세요. 누락은
 * `lib/features/__tests__/open-board-flag.test.ts` 드리프트 가드가 잡습니다.
 *
 * 타입을 `boolean` 으로 명시한 건 의도적입니다 — `false` 리터럴로 좁혀지면
 * `if (OPEN_BOARD_ENABLED)` 분기가 dead-code 로 취급돼 lint 에 걸립니다.
 */
export const OPEN_BOARD_ENABLED: boolean = false;
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS (에러 0)

- [ ] **Step 3: 커밋**

```bash
git add lib/features/open-board.ts docs/superpowers/specs/2026-06-29-hide-open-board-design.md docs/superpowers/plans/2026-06-29-hide-open-board.md
git commit -m "feat(open-board): 오픈게시판 kill switch 플래그 SSOT 추가"
```

---

### Task 2: 사이드바 nav + 단축키 + 팔레트 nav 게이트 (`nav-config`)

`getNavConfig`에서 플래그 off면 pg inbox 섹션의 `opportunities` 링크를 제거한다. 이 한 곳이 사이드바 링크, `g→o` 단축키(`getChordMap`), 팔레트 nav 항목(`getNavCommands`)을 동시에 끈다.

**Files:**
- Modify: `lib/nav/nav-config.ts`
- Create (test): `lib/nav/__tests__/nav-config.open-board.test.ts`
- Modify (on-branch 보존): `lib/nav/__tests__/nav-config.test.ts`, `lib/nav/__tests__/nav-commands.test.ts`

**Interfaces:**
- Consumes: `OPEN_BOARD_ENABLED` (Task 1)
- Produces: `getNavConfig(ws)`·`getNavCommands(ws)`·`getChordMap(ws)` 동작 변화 — off면 pg 결과에서 `/opportunities` 제거. 시그니처 불변.

- [ ] **Step 1: off-branch 실패 테스트 작성**

`lib/nav/__tests__/nav-config.open-board.test.ts` (모킹 없음 = 실제 플래그 false):
```ts
import { describe, it, expect } from 'vitest';
import { getNavConfig, getNavCommands, getChordMap } from '../nav-config';

// 출고 기본값 OPEN_BOARD_ENABLED=false 기준. 오픈게시판 진입점이 전부 사라져야 한다.
describe('nav-config — open board disabled (flag off)', () => {
  it('pg inbox 섹션에서 opportunities 링크가 제거된다', () => {
    const inbox = getNavConfig('pg').sections.find((s) => s.id === 'inbox');
    expect(inbox?.links?.map((l) => l.href) ?? []).not.toContain('/opportunities');
  });

  it('pg getNavCommands 에 /opportunities 가 없다', () => {
    expect(getNavCommands('pg').map((c) => c.href)).not.toContain('/opportunities');
  });

  it("pg getChordMap 에 'o' (g→o) 단축키가 없다", () => {
    expect(getChordMap('pg')).not.toHaveProperty('o');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/nav/__tests__/nav-config.open-board.test.ts`
Expected: FAIL — 3건 모두 `/opportunities`/`o`가 여전히 존재.

- [ ] **Step 3: nav-config 게이트 구현**

`lib/nav/nav-config.ts` — 파일 상단 import 추가 (기존 import 블록 끝):
```ts
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
```

`getNavConfig` 위에 헬퍼 추가하고, `getNavConfig` 본문의 `INBOX_SECTION` 참조를 헬퍼 호출로 교체:
```ts
// 오픈게시판이 꺼져 있으면 PG inbox 섹션에서 '참여 가능한 견적'(opportunities)
// 진입점을 제거한다. getNavConfig 를 통해 사이드바·단축키·팔레트 nav 가 한 번에 반영된다.
function inboxSection(): NavSection {
  if (OPEN_BOARD_ENABLED) return INBOX_SECTION;
  return {
    ...INBOX_SECTION,
    links: (INBOX_SECTION.links ?? []).filter((l) => l.id !== 'opportunities'),
  };
}

export function getNavConfig(workspaceType: WorkspaceType): NavConfig {
  const workspaceSection = workspaceType === 'buyer' ? RFP_SECTION : inboxSection();
  const top: NavLeaf[] =
    workspaceType === 'pg'
      ? [HOME, NOTIFICATIONS, MESSAGES, QUOTE_TEMPLATES]
      : [HOME, NOTIFICATIONS, MESSAGES];

  return {
    top,
    sections: [workspaceSection, SETTINGS_SECTION],
  };
}
```
(기존 `getNavConfig` 의 `INBOX_SECTION` 한 군데만 `inboxSection()` 으로 바뀐다. 나머지 본문 동일.)

- [ ] **Step 4: off-branch 통과 확인**

Run: `pnpm test lib/nav/__tests__/nav-config.open-board.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: 기존 on-branch 테스트 깨짐 확인**

Run: `pnpm test lib/nav/__tests__/nav-config.test.ts lib/nav/__tests__/nav-commands.test.ts`
Expected: FAIL — `nav-config.test.ts`(opportunities 링크 단언), `nav-commands.test.ts`(pg에 /opportunities 포함 단언)이 깨진다. 이는 정상 — 다음 스텝에서 플래그를 true로 모킹해 on-branch 커버를 보존한다.

- [ ] **Step 6: 기존 테스트에 플래그 true 모킹 추가**

`lib/nav/__tests__/nav-config.test.ts` — 첫 import 라인들 위(파일 맨 위)에 추가:
```ts
import { vi } from 'vitest';
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
```
(이미 `vitest`에서 다른 심볼을 import 중이면 `vi`를 그 import에 합치고 `vi.mock` 한 줄만 추가.)

`lib/nav/__tests__/nav-commands.test.ts` — 동일하게 파일 맨 위에 추가:
```ts
import { vi } from 'vitest';
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
```

- [ ] **Step 7: 전체 nav 테스트 통과 확인**

Run: `pnpm test lib/nav/__tests__/`
Expected: PASS (off-branch + on-branch 모두 green)

- [ ] **Step 8: 커밋**

```bash
git add lib/nav/nav-config.ts lib/nav/__tests__/nav-config.open-board.test.ts lib/nav/__tests__/nav-config.test.ts lib/nav/__tests__/nav-commands.test.ts
git commit -m "feat(open-board): 사이드바·단축키·팔레트 nav 에서 오픈게시판 진입점 게이트"
```

---

### Task 3: PG 홈 탐색 섹션 게이트 (`HomeDashboard`)

**Files:**
- Modify: `components/home/HomeDashboard.tsx`
- Create (test): `components/home/__tests__/HomeDashboard.open-board.test.tsx`
- Modify (on-branch 보존): `components/home/__tests__/HomeDashboard.test.tsx`

**Interfaces:**
- Consumes: `OPEN_BOARD_ENABLED` (Task 1)
- Produces: `HomeDashboard` props 불변. off면 pg openRfps 가 있어도 "참여 가능한 견적" 섹션 미렌더.

- [ ] **Step 1: off-branch 실패 테스트 작성**

`components/home/__tests__/HomeDashboard.open-board.test.tsx` (모킹 없음 = 실제 플래그 false):
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// OpportunityRequestDialog 가 transitively 끌어오는 의존성 차단 (기존 테스트와 동일).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/server/actions/rfp', () => ({ createPgRequestAction: vi.fn() }));

import { HomeDashboard } from '../HomeDashboard';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';

const base: Dashboard = {
  kpis: [],
  groups: [],
  openRfps: [
    {
      rfpCode: 'P-OPEN1',
      buyerName: '구매사A',
      title: '카드 PG 견적',
      websiteUrl: 'https://a.example.com',
      deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      requiredPaymentMethods: ['card'],
      customPaymentMethodLabels: [],
      mainProducts: null,
    },
  ],
};

describe('HomeDashboard — open board disabled (flag off)', () => {
  it('pg openRfps 가 있어도 탐색 섹션을 렌더하지 않는다', () => {
    render(<HomeDashboard dashboard={base} workspaceType="pg" items={[]} unreadCount={0} />);
    expect(screen.queryByText('참여 가능한 견적')).not.toBeInTheDocument();
    expect(screen.queryByText('카드 PG 견적')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '참여 요청' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/home/__tests__/HomeDashboard.open-board.test.tsx`
Expected: FAIL — 섹션이 여전히 렌더됨.

- [ ] **Step 3: HomeDashboard 게이트 구현**

`components/home/HomeDashboard.tsx` — import 블록에 추가:
```tsx
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
```

탐색 섹션 렌더 조건(현 line 56) 맨 앞에 플래그 추가:
```tsx
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
```

- [ ] **Step 4: off-branch 통과 확인**

Run: `pnpm test components/home/__tests__/HomeDashboard.open-board.test.tsx`
Expected: PASS

- [ ] **Step 5: 기존 테스트 깨짐 확인**

Run: `pnpm test components/home/__tests__/HomeDashboard.test.tsx`
Expected: FAIL — "renders the open-RFP discovery section for a PG with openRfps" 테스트가 깨진다 (정상).

- [ ] **Step 6: 기존 테스트에 플래그 true 모킹 추가**

`components/home/__tests__/HomeDashboard.test.tsx` — 파일 맨 위 기존 `vi.mock` 들과 같은 위치에 추가:
```tsx
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
```
(이 파일은 이미 `vi`를 import 중이므로 `vi.mock` 한 줄만 추가.)

- [ ] **Step 7: 홈 테스트 전체 통과 확인**

Run: `pnpm test components/home/__tests__/`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add components/home/HomeDashboard.tsx components/home/__tests__/HomeDashboard.open-board.test.tsx components/home/__tests__/HomeDashboard.test.tsx
git commit -m "feat(open-board): PG 홈 탐색 섹션 게이트"
```

---

### Task 4: `/opportunities` 준비중 뷰

플래그 off면 보드 대신 "준비중" EmptyState 를 렌더한다. `requirePgPage` 가드는 유지. 뷰는 별도 프레젠테이션 컴포넌트로 분리해 테스트한다.

**Files:**
- Create: `components/opportunities/OpportunitiesUnavailable.tsx`
- Create (test): `components/opportunities/__tests__/OpportunitiesUnavailable.test.tsx`
- Modify: `app/(app)/opportunities/page.tsx`

**Interfaces:**
- Consumes: `OPEN_BOARD_ENABLED` (Task 1), 기존 `PageHeader`·`EmptyState`·`InboxIcon`
- Produces: `OpportunitiesUnavailable` (props 없음) — page 가 off일 때 렌더.

> **TDD 메모:** 프레젠테이션 컴포넌트(문구)는 렌더 테스트로 검증한다. `page.tsx` 의 분기는 async RSC 라 단위 테스트가 번거롭다 — 단순 shell 분기(CLAUDE.md page-shell 예외)로 두고 Task 8 드리프트 가드가 플래그 참조를 강제한다.

- [ ] **Step 1: 준비중 뷰 실패 테스트 작성**

`components/opportunities/__tests__/OpportunitiesUnavailable.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpportunitiesUnavailable } from '../OpportunitiesUnavailable';

describe('OpportunitiesUnavailable', () => {
  it('준비중 안내 문구를 보여준다', () => {
    render(<OpportunitiesUnavailable />);
    expect(screen.getByText('참여 가능한 견적을 잠시 닫았어요')).toBeInTheDocument();
    expect(screen.getByText('곧 다시 열릴 예정이에요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/opportunities/__tests__/OpportunitiesUnavailable.test.tsx`
Expected: FAIL — 모듈/컴포넌트 없음.

- [ ] **Step 3: 준비중 뷰 컴포넌트 구현**

`components/opportunities/OpportunitiesUnavailable.tsx`:
```tsx
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';

/**
 * 오픈게시판 kill switch(OPEN_BOARD_ENABLED=false) 동안 /opportunities 직접
 * 진입 시 보여주는 준비중 화면. 보드 데이터는 노출하지 않는다.
 */
export function OpportunitiesUnavailable() {
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <EmptyState
        icon={<InboxIcon size={32} />}
        title="참여 가능한 견적을 잠시 닫았어요"
        description="곧 다시 열릴 예정이에요."
      />
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/opportunities/__tests__/OpportunitiesUnavailable.test.tsx`
Expected: PASS

- [ ] **Step 5: 페이지에 플래그 분기 추가**

`app/(app)/opportunities/page.tsx` — import 추가:
```tsx
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
import { OpportunitiesUnavailable } from '@/components/opportunities/OpportunitiesUnavailable';
```

`OpportunitiesPage` 본문을 플래그 분기로 교체한다. **`requirePgPage` 는 한 번만 호출**하고, 플래그 off면 준비중 뷰를 반환한다:
```tsx
export default async function OpportunitiesPage() {
  const session = await requirePgPage('/opportunities');
  if (!OPEN_BOARD_ENABLED) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="참여 가능한 견적" />
        <OpportunitiesUnavailable />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <Suspense
        fallback={
          <>
            <PageHeader title="참여 가능한 견적" />
            <div className="px-6 py-4 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              LOADING…
            </div>
          </>
        }
      >
        <OpportunitiesLoader wsId={session.user.workspaceId} />
      </Suspense>
    </div>
  );
}
```
(`OpportunitiesLoader` 함수는 그대로 둔다.)

- [ ] **Step 6: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add components/opportunities/OpportunitiesUnavailable.tsx components/opportunities/__tests__/OpportunitiesUnavailable.test.tsx "app/(app)/opportunities/page.tsx"
git commit -m "feat(open-board): /opportunities 직접 진입 시 준비중 화면 표시"
```

---

### Task 5: 커맨드팔레트 오픈게시판 그룹 게이트 (`CommandPalette`)

플래그 off면 entity 검색 결과의 "참여 가능한 견적" 그룹을 렌더하지 않는다. (nav "참여 가능한 견적" 항목은 Task 2 의 nav-config 게이트로 이미 사라진다.)

**Files:**
- Modify: `components/shell/CommandPalette.tsx`
- Create (test): `components/shell/__tests__/CommandPalette.open-board.test.tsx`
- Modify (on-branch 보존): `components/shell/__tests__/CommandPalette.test.tsx`

**Interfaces:**
- Consumes: `OPEN_BOARD_ENABLED` (Task 1)
- Produces: `CommandPalette` props 불변. off면 검색이 opportunities 를 반환해도 "참여 가능한 견적" 그룹 미렌더.

- [ ] **Step 1: off-branch 실패 테스트 작성**

`components/shell/__tests__/CommandPalette.open-board.test.tsx` (모킹 없음 = 실제 플래그 false; 기존 파일 헤더 미러):
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

const { searchEntitiesMock, pushMock } = vi.hoisted(() => ({
  searchEntitiesMock: vi.fn(),
  pushMock: vi.fn(),
}));
vi.mock('@/lib/server/actions/search/searchEntitiesAction', () => ({
  searchEntitiesAction: (q: string) => searchEntitiesMock(q),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CommandPalette } from '../CommandPalette';
import { useUIStore } from '@/lib/stores/ui';

beforeEach(() => {
  searchEntitiesMock.mockReset();
  pushMock.mockReset();
});
afterEach(() => {
  useUIStore.setState({ commandPaletteOpen: false });
});

describe('CommandPalette — open board disabled (flag off)', () => {
  it('pg: opportunities 검색 결과가 와도 "참여 가능한 견적" 그룹을 렌더하지 않는다', async () => {
    searchEntitiesMock.mockResolvedValue({
      rfps: [],
      bids: [],
      opportunities: [
        { rfpCode: 'P-2605-0050', buyerName: '구매사A', title: '신규 입찰 건', websiteUrl: null, href: '/opportunities' },
      ],
    });
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="pg" />);
    fireEvent.change(screen.getByPlaceholderText('검색...'), { target: { value: '입찰' } });
    // 디바운스 후에도 그룹이 나타나지 않아야 한다.
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText('참여 가능한 견적')).not.toBeInTheDocument();
    expect(screen.queryByText('신규 입찰 건')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/shell/__tests__/CommandPalette.open-board.test.tsx`
Expected: FAIL — 그룹이 렌더됨.

- [ ] **Step 3: CommandPalette 게이트 구현**

`components/shell/CommandPalette.tsx` — import 추가:
```tsx
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
```

`entityGroups` 배열 정의(현 line ~111부터) 중 "참여 가능한 견적" 그룹(현 line 140-149)을 조건부로 만든다. `entityGroups` 선언을 다음과 같이 base 그룹 + 조건부 추가 형태로 바꾼다:
```tsx
  const entityGroups: {
    heading: string;
    items: { key: string; value: string; href: string; primary: string; aside?: string; sub?: string }[];
  }[] = [
    {
      heading: '견적 요청',
      items: results.rfps.map((r) => ({
        key: r.code,
        value: `rfp-${r.code}`,
        href: r.href,
        primary: r.title,
        sub: r.memo,
      })),
    },
    {
      heading: '견적서',
      items: results.bids.map((b) => ({
        key: b.bidId,
        value: `bid-${b.bidId}`,
        href: b.href,
        primary: b.rfpTitle,
        aside: b.pgWsName,
        sub: b.memo,
      })),
    },
    // 오픈게시판이 켜져 있을 때만 "참여 가능한 견적" 그룹을 노출한다.
    ...(OPEN_BOARD_ENABLED
      ? [
          {
            heading: '참여 가능한 견적',
            items: results.opportunities.map((o) => ({
              key: o.rfpCode,
              value: `opp-${o.rfpCode}`,
              href: o.href,
              primary: o.title,
              aside: o.buyerName,
            })),
          },
        ]
      : []),
  ];
```

- [ ] **Step 4: off-branch 통과 확인**

Run: `pnpm test components/shell/__tests__/CommandPalette.open-board.test.tsx`
Expected: PASS

- [ ] **Step 5: 기존 테스트 깨짐 확인**

Run: `pnpm test components/shell/__tests__/CommandPalette.test.tsx`
Expected: FAIL — "pg: shows 참여 가능한 견적 …"(nav 항목)과 "pg: typing a query renders 참여 가능한 견적 results"(entity 그룹) 두 테스트가 깨진다 (정상).

- [ ] **Step 6: 기존 테스트에 플래그 true 모킹 추가**

`components/shell/__tests__/CommandPalette.test.tsx` — 다른 `vi.mock` 들과 같은 상단 위치에 추가:
```tsx
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
```
(이 한 줄이 nav-config 경로와 팔레트 자체 게이트 둘 다 true 로 만들어 기존 단언을 보존한다.)

- [ ] **Step 7: 팔레트 테스트 전체 통과 확인**

Run: `pnpm test components/shell/__tests__/CommandPalette.test.tsx components/shell/__tests__/CommandPalette.open-board.test.tsx`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add components/shell/CommandPalette.tsx components/shell/__tests__/CommandPalette.open-board.test.tsx components/shell/__tests__/CommandPalette.test.tsx
git commit -m "feat(open-board): 커맨드팔레트 오픈게시판 검색 그룹 게이트"
```

---

### Task 6: 작성 위저드 노출 체크박스 게이트 (`RfpStep4Review`)

**Files:**
- Modify: `components/rfp/RfpStep4Review.tsx`
- Create (test): `components/rfp/__tests__/RfpStep4Review.open-board.test.tsx`
- Modify (on-branch 보존): `components/rfp/__tests__/RfpStep4Review.test.tsx`

**Interfaces:**
- Consumes: `OPEN_BOARD_ENABLED` (Task 1)
- Produces: `RfpStep4Review` props 불변. off면 "오픈 게시판에 노출하기" 체크박스 블록 미렌더. `boardVisible` 드래프트 기본값(true)은 유지 → 데이터 무영향.

- [ ] **Step 1: off-branch 실패 테스트 작성**

`components/rfp/__tests__/RfpStep4Review.open-board.test.tsx` (모킹 없음 = 실제 플래그 false; 기존 store 셋업 미러):
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { RfpStep4Review } from '../RfpStep4Review';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.setState({
    title: '테스트 제안건',
    deadline: '',
    allowedPgWorkspaceIds: [],
    websiteUrl: 'https://example.com',
    annualPgVolume: '10억',
    currentSolution: 'cafe24',
    currentSettlementCycle: '',
    deliveryServicePeriod: '',
    boardVisible: true,
    currentFeeRate: '',
    currentFeeVisibleToPg: true,
    contractType: null,
    memo: '',
    rfpFiles: [],
  });
});

describe('RfpStep4Review — open board disabled (flag off)', () => {
  it('오픈 게시판 노출 체크박스를 렌더하지 않는다', () => {
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        submitting={false}
        serverError=""
      />,
    );
    expect(screen.queryByRole('checkbox', { name: /오픈 게시판/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/rfp/__tests__/RfpStep4Review.open-board.test.tsx`
Expected: FAIL — 체크박스가 여전히 렌더됨.

- [ ] **Step 3: RfpStep4Review 게이트 구현**

`components/rfp/RfpStep4Review.tsx` — import 추가:
```tsx
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
```

노출 체크박스 블록(현 line 135-152)을 플래그로 감싼다:
```tsx
      {/* 오픈 게시판 노출 (opt-out) — 기본 노출(true). kill switch 시 숨김 */}
      {OPEN_BOARD_ENABLED && (
        <div className="flex items-start gap-3">
          <Checkbox
            id="rfp-board-visible"
            checked={draft.boardVisible}
            onCheckedChange={(checked) => draft.setField('boardVisible', checked)}
            aria-label="오픈 게시판에 노출하기"
            className="mt-0.5"
          />
          <label htmlFor="rfp-board-visible" className="cursor-pointer">
            <span className="block text-[14px] text-[var(--md-sys-color-on-surface)]">
              오픈 게시판에 노출하기
            </span>
            <span className="block text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
              다른 PG사가 이 견적 요청을 발견하고 참여를 요청할 수 있어요.
            </span>
          </label>
        </div>
      )}
```

- [ ] **Step 4: off-branch 통과 확인**

Run: `pnpm test components/rfp/__tests__/RfpStep4Review.open-board.test.tsx`
Expected: PASS

- [ ] **Step 5: 기존 테스트 깨짐 확인**

Run: `pnpm test components/rfp/__tests__/RfpStep4Review.test.tsx`
Expected: FAIL — 체크박스 관련 3개 테스트(line 180/187/194 부근)가 깨진다 (정상).

- [ ] **Step 6: 기존 테스트에 플래그 true 모킹 추가**

`components/rfp/__tests__/RfpStep4Review.test.tsx` — 파일 맨 위 import 직후에 추가:
```tsx
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
```
(이 파일은 이미 `vitest` 에서 `vi` 를 import 중이므로 `vi.mock` 한 줄만 추가.)

- [ ] **Step 7: 위저드 테스트 전체 통과 확인**

Run: `pnpm test components/rfp/__tests__/RfpStep4Review.test.tsx components/rfp/__tests__/RfpStep4Review.open-board.test.tsx`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add components/rfp/RfpStep4Review.tsx components/rfp/__tests__/RfpStep4Review.open-board.test.tsx components/rfp/__tests__/RfpStep4Review.test.tsx
git commit -m "feat(open-board): 작성 위저드 게시판 노출 체크박스 게이트"
```

---

### Task 7: RFP 상세 노출 상태 칩 게이트 (`RfpBoardVisibilityStatus`)

컴포넌트 내부에서 플래그 off면 `null` 반환 → 3개 호출처(`rfp/[id]`, `rfp/@modal/(.)[id]`, `BuyerDealRoomBody`)를 한 점에서 커버.

**Files:**
- Modify: `components/rfp/RfpBoardVisibilityStatus.tsx`
- Create (test): `components/rfp/__tests__/RfpBoardVisibilityStatus.open-board.test.tsx`
- Modify (on-branch 보존): `components/rfp/__tests__/RfpBoardVisibilityStatus.test.tsx`

> `BuyerDealRoomBody.test.tsx` 는 이미 이 컴포넌트를 stub 으로 모킹하므로 수정 불필요.

**Interfaces:**
- Consumes: `OPEN_BOARD_ENABLED` (Task 1)
- Produces: `RfpBoardVisibilityStatus({ boardVisible })` props 불변. off면 `null`.

- [ ] **Step 1: off-branch 실패 테스트 작성**

`components/rfp/__tests__/RfpBoardVisibilityStatus.open-board.test.tsx` (모킹 없음 = 실제 플래그 false):
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { RfpBoardVisibilityStatus } from '../RfpBoardVisibilityStatus';

describe('RfpBoardVisibilityStatus — open board disabled (flag off)', () => {
  it('boardVisible=true 여도 칩을 렌더하지 않는다 (null)', () => {
    render(<RfpBoardVisibilityStatus boardVisible />);
    expect(screen.queryByText('게시판 노출 중')).not.toBeInTheDocument();
  });

  it('boardVisible=false 여도 칩을 렌더하지 않는다 (null)', () => {
    render(<RfpBoardVisibilityStatus boardVisible={false} />);
    expect(screen.queryByText('게시판 비노출')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/rfp/__tests__/RfpBoardVisibilityStatus.open-board.test.tsx`
Expected: FAIL — 칩이 여전히 렌더됨.

- [ ] **Step 3: RfpBoardVisibilityStatus 게이트 구현**

`components/rfp/RfpBoardVisibilityStatus.tsx` — import 추가:
```tsx
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
```

컴포넌트 본문 맨 위에 early return 추가:
```tsx
export function RfpBoardVisibilityStatus({ boardVisible }: { boardVisible: boolean }) {
  // 오픈게시판 kill switch 동안에는 노출 상태 칩 자체를 숨긴다 (3개 호출처 일괄).
  if (!OPEN_BOARD_ENABLED) return null;

  const chipLabel = boardVisible ? '게시판 노출 중' : '게시판 비노출';
  // …이하 기존 본문 동일
```

- [ ] **Step 4: off-branch 통과 확인**

Run: `pnpm test components/rfp/__tests__/RfpBoardVisibilityStatus.open-board.test.tsx`
Expected: PASS

- [ ] **Step 5: 기존 테스트 깨짐 확인**

Run: `pnpm test components/rfp/__tests__/RfpBoardVisibilityStatus.test.tsx`
Expected: FAIL — 5개 테스트 전부 깨진다 (칩이 null, 정상).

- [ ] **Step 6: 기존 테스트에 플래그 true 모킹 추가**

`components/rfp/__tests__/RfpBoardVisibilityStatus.test.tsx` — 파일 맨 위(다른 `vi.stubGlobal` 보다 위, import 전)에 추가. 이 파일은 이미 `vi` 를 import 중이다:
```tsx
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
```

- [ ] **Step 7: 칩 테스트 전체 통과 확인**

Run: `pnpm test components/rfp/__tests__/RfpBoardVisibilityStatus.test.tsx components/rfp/__tests__/RfpBoardVisibilityStatus.open-board.test.tsx`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add components/rfp/RfpBoardVisibilityStatus.tsx components/rfp/__tests__/RfpBoardVisibilityStatus.open-board.test.tsx components/rfp/__tests__/RfpBoardVisibilityStatus.test.tsx
git commit -m "feat(open-board): RFP 상세 게시판 노출 상태 칩 게이트"
```

---

### Task 8: 드리프트 가드 테스트

모든 노출 surface 가 `OPEN_BOARD_ENABLED` 를 참조하는지 소스 읽어 검증. 향후 누가 게이트를 빠뜨리면 빨갛게 뜬다. (`proxy-matcher.test.ts` 의 `readFileSync` 패턴 미러)

**Files:**
- Create (test): `lib/features/__tests__/open-board-flag.test.ts`

**Interfaces:**
- Consumes: 모든 surface 소스 파일 경로 + `lib/features/open-board.ts`

> **TDD 메모:** 구조(드리프트) 가드라 Task 2-7 완료 후엔 즉시 통과한다 — 행위 RED-first 가 아니다. Step 2 에서 일부러 참조 하나를 깨 가드가 "무는지" 확인한 뒤 되돌려 RED 를 실증한다.

- [ ] **Step 1: 드리프트 가드 테스트 작성**

`lib/features/__tests__/open-board-flag.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPEN_BOARD_ENABLED } from '../open-board';

// 레포 루트 기준 상대 경로. 모든 오픈게시판 노출 surface 는 플래그를 참조해야 한다.
const SURFACES = [
  'lib/nav/nav-config.ts',
  'components/home/HomeDashboard.tsx',
  'app/(app)/opportunities/page.tsx',
  'components/shell/CommandPalette.tsx',
  'components/rfp/RfpStep4Review.tsx',
  'components/rfp/RfpBoardVisibilityStatus.tsx',
];

function readSurface(rel: string): string {
  // 이 테스트 파일은 lib/features/__tests__/ → 레포 루트는 세 단계 위.
  return readFileSync(resolve(__dirname, '../../..', rel), 'utf8');
}

describe('open-board kill switch — drift guard', () => {
  it('플래그가 boolean 으로 export 된다', () => {
    expect(typeof OPEN_BOARD_ENABLED).toBe('boolean');
  });

  for (const rel of SURFACES) {
    it(`${rel} 가 OPEN_BOARD_ENABLED 를 참조한다`, () => {
      expect(readSurface(rel)).toContain('OPEN_BOARD_ENABLED');
    });
  }
});
```

- [ ] **Step 2: 가드가 무는지 실증 (RED 확인)**

`lib/nav/nav-config.ts` 에서 `OPEN_BOARD_ENABLED` import 한 줄을 잠시 주석 처리(또는 `inboxSection` 의 참조를 임시로 제거)한 뒤:

Run: `pnpm test lib/features/__tests__/open-board-flag.test.ts`
Expected: FAIL — `lib/nav/nav-config.ts 가 OPEN_BOARD_ENABLED 를 참조한다` 가 실패. (nav-config 의 다른 테스트도 깨질 수 있음 — 정상)
그 뒤 주석을 **반드시 되돌린다.**

- [ ] **Step 3: 되돌린 뒤 전체 통과 확인**

Run: `pnpm test lib/features/__tests__/open-board-flag.test.ts`
Expected: PASS (7건: boolean + 6 surface)

- [ ] **Step 4: 커밋**

```bash
git add lib/features/__tests__/open-board-flag.test.ts
git commit -m "test(open-board): surface 누락 방지 드리프트 가드"
```

---

### Task 9: 전체 헬스 체크 + 마무리

**Files:** (없음 — 검증만)

- [ ] **Step 1: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS (에러 0)

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: PASS (에러 0). 특히 `no-unnecessary-condition`/dead-code 없음 — 플래그 `: boolean` 타입 덕분.

- [ ] **Step 3: 영향 범위 테스트 일괄 실행**

Run:
```bash
pnpm test lib/nav components/home components/opportunities components/shell components/rfp lib/features
```
Expected: PASS (off-branch 신규 + on-branch 보존 모두 green)

- [ ] **Step 4: 전체 스위트 (가능하면)**

Run: `pnpm test`
Expected: PASS. (전체 실행이 환경상 느리거나 기존 무관 flake 가 있으면 단독 파일 green + tsc/lint clean 을 게이트로 삼는다 — 메모리 jsdom-localstorage-mass-fail 참조.)

- [ ] **Step 5: 수동 확인 (선택, 회귀 방지는 아님)**

`pnpm dev` 로 PG 워크스페이스 로그인 후:
- 사이드바에 "참여 가능한 견적" 없음 / `g o` 무반응
- `/opportunities` 직접 진입 → "참여 가능한 견적을 잠시 닫았어요" 준비중 화면
- 홈에 탐색 섹션 없음 / ⌘K 팔레트에 오픈게시판 그룹 없음
- 구매사 워크스페이스: 작성 위저드 4단계에 노출 체크박스 없음 / RFP 상세에 노출 상태 칩 없음

- [ ] **Step 6: 다시 켜는 절차 문서 확인**

`lib/features/open-board.ts` 의 주석에 "`true` 로 바꿔 배포" 가 명시돼 있는지 확인. (재노출 시 단일 변경점.)

---

## Self-Review

**1. Spec coverage:**
- 단일 플래그 SSOT → Task 1 ✓
- 6개 surface(사이드바/단축키/팔레트nav, 홈 탐색, /opportunities 준비중, 팔레트 그룹, 위저드 체크박스, 상세 칩) → Task 2/3/4/5/6/7 ✓
- 드리프트 가드 → Task 8 ✓
- UI-only(서버·RfpPendingRequests·데이터 불변) → 명시적 비대상, 어떤 task 도 건드리지 않음 ✓
- 기존 테스트 on-branch 보존 → Task 2/3/5/6/7 의 모킹 스텝 ✓
- 재노출 절차 → Task 9 Step 6 ✓

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함. ✓

**3. Type consistency:** 플래그 심볼 `OPEN_BOARD_ENABLED` 전 task 동일. import 경로 `@/lib/features/open-board` 일관. 컴포넌트/함수 시그니처 전부 불변(props 추가 없음). ✓

## 알려진 함정 (executor 참고)

- **플래그 호출-시점 읽기** — nav-config 는 반드시 `inboxSection()`(함수) 안에서 읽어야 모킹/토글이 먹는다. 모듈 top-level 에서 한 번 읽으면 안 됨.
- **off-branch 테스트는 모킹 없음** — 실제 플래그 false 그대로. 새 파일에 `vi.mock(...true)` 를 넣지 말 것(그러면 off 검증이 무의미해짐).
- **on-branch 보존 모킹은 정적 `vi.mock`** — 파일 전체에 적용(hoisted). 같은 파일에서 on/off 를 섞지 않는다 — off 는 별도 신규 파일.
- **cmdk 빈 그룹** — opportunities 그룹은 배열에서 통째로 제외(spread `...(flag ? [..] : [])`). 빈 items 만 두면 헤딩이 남는다.
- **워크트리 LSP 거짓 진단** — fresh `pnpm tsc`/`pnpm test` 가 진실.
- **`app/(app)/opportunities/page.tsx`** — 괄호 경로라 git add/test 시 따옴표 필요: `"app/(app)/opportunities/page.tsx"`.
