# Landing Demo Guided-Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the landing `#process` embedded demo from a full-app-with-dead-clicks into a labeled, watch-first guided tour: named step bar, inert non-story chrome, reworked takeover model, and a section heading/intro.

**Architecture:** Reuse the existing real sidebar/pages embedded by `DemoAppShell`, but (1) add an opt-in `inert` prop to the shared `NavItem`/`SidebarSubItem` so the demo can render non-story nav as muted non-interactive elements, (2) add a presentational `DemoStepBar` below the frame driven by the existing `useDemoStepAutoplay` state, and (3) rework `DemoAppShell`'s takeover so only intentional content/step-bar/live-nav interactions stop the tour.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind v4 (`--md-sys-*` tokens), Vitest + Testing Library.

## Global Constraints

- **TDD, RED first.** Every code task: write the failing test, run it, SEE it fail, then minimal implementation. (Pure CSS/style-only edits are the only TDD exemption.)
- **Real shell unaffected.** The `inert` prop defaults to `false`; `SidebarSection`'s `inertHref` is optional and absent in production. No production sidebar behavior changes — existing `SidebarSection` tests must stay green.
- **Linear design hard-rules.** Interactive elements use `rounded-[var(--md-sys-shape-small)]` (6px) — no pills. Borders use `--md-sys-color-outline-variant`. Step numerals use the `.md-numeric` class. No shadows on the step bar.
- **Copy in 해요체** (UX_WRITING voice). Exact strings: heading `실제 화면을 미리 둘러보세요`; intro `회원가입 없이 SupporterB 실제 화면을 그대로 체험할 수 있어요. 아래 단계를 눌러 직접 둘러보세요.`; step labels `홈` / `견적 요청` / `견적 비교·선정` / `새 견적 요청`; replay `처음부터 다시 보기`.
- **Allowlist SSOT:** live demo nav hrefs = `{ '/home', '/rfp', '/rfp-create' }`.
- **Commits:** do NOT auto-commit (user rule). At each Commit step, present the suggested message (imperative; repo uses conventional prefixes like `feat(landing):`; no `Co-Authored-By`) and let the user commit.
- **Test runner:** `pnpm test <path>` for a single file (RED/GREEN); `pnpm test` for the full green.

## File Structure

- `components/shell/sidebar/NavItem.tsx` — add `inert?` prop (shared).
- `components/shell/sidebar/SidebarSubItem.tsx` — add `inert?` prop (shared).
- `lib/nav/demo-nav-context.tsx` — add `DEMO_LIVE_NAV_HREFS` + `isInertDemoNavHref`.
- `components/shell/sidebar/SidebarSection.tsx` — add optional `inertHref?` predicate (demo-only).
- `components/landing/demo-app/DemoSidebar.tsx` — wire inert allowlist, drop rail, inert footer.
- `components/landing/demo-app/DemoStepBar.tsx` — NEW presentational step bar.
- `components/landing/demo-app/DemoAppShell.tsx` — takeover rework + render `DemoStepBar`.
- `components/landing/LandingHero.tsx` — heading + intro in `#process`.

Tests live in the matching `__tests__/` dirs.

---

### Task 1: `NavItem` inert prop

**Files:**
- Modify: `components/shell/sidebar/NavItem.tsx`
- Test: `components/shell/sidebar/__tests__/NavItem.test.tsx` (create)

**Interfaces:**
- Produces: `NavItem` gains optional `inert?: boolean` (default `false`). When `true`, renders a non-anchor `<span aria-disabled="true">` (muted, not focusable, no hover, no tooltip) carrying the same icon+label box; when unset, unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { NavItem } from '../NavItem';
import { SidebarProvider } from '@/components/ui/sidebar';

function renderItem(node: React.ReactNode) {
  return render(<SidebarProvider>{node}</SidebarProvider>);
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, media: '', onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

describe('NavItem', () => {
  it('기본은 동작하는 링크다', () => {
    renderItem(<NavItem href="/home" label="홈" />);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/home');
  });

  it('inert면 링크가 아니라 aria-disabled 비활성 요소로 렌더한다', () => {
    renderItem(<NavItem href="/notifications" label="알림" inert />);
    expect(screen.queryByRole('link', { name: '알림' })).toBeNull();
    expect(screen.getByText('알림').closest('[aria-disabled="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/shell/sidebar/__tests__/NavItem.test.tsx`
Expected: the `inert` test FAILS (inert still renders a link / prop unknown).

- [ ] **Step 3: Write minimal implementation**

In `NavItem.tsx`, add `inert` to the props type:

```tsx
type NavItemProps = {
  href: string;
  label: string;
  icon?: IconComponent;
  shortcut?: NavShortcut;
  active?: boolean;
  badge?: React.ReactNode;
  className?: string;
  onNavigate?: () => void;
  inert?: boolean;
};
```

Add an `inert` const class and an early return inside the component, after the `useSidebar()` hook call and before `const link = (...)`:

```tsx
export function NavItem({
  href, label, icon: Icon, shortcut, active = false, badge, className, onNavigate, inert = false,
}: NavItemProps) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;
  const showShortcutTooltip = state === 'expanded' && !isMobile && shortcut != null;
  const showTooltip = isCollapsed || showShortcutTooltip;

  if (inert) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          navItemBase,
          'text-[var(--md-sys-color-on-surface-variant)] opacity-50 cursor-default select-none',
          className,
        )}
      >
        {Icon && (
          <span className="relative inline-flex shrink-0">
            <Icon size={18} />
          </span>
        )}
        <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
      </span>
    );
  }

  const link = (
```

(Leave the rest of the function unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/shell/sidebar/__tests__/NavItem.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

Suggested message (do not auto-commit):
```
feat(landing): add inert variant to NavItem for embedded demo
```

---

### Task 2: `SidebarSubItem` inert prop

**Files:**
- Modify: `components/shell/sidebar/SidebarSubItem.tsx`
- Test: `components/shell/sidebar/__tests__/SidebarSubItem.test.tsx` (create)

**Interfaces:**
- Produces: `SidebarSubItem` gains optional `inert?: boolean` (default `false`). When `true`, renders a non-anchor `<span aria-disabled="true">` muted; unset → unchanged link.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { SidebarSubItem } from '../SidebarSubItem';
import { SidebarProvider } from '@/components/ui/sidebar';

function renderItem(node: React.ReactNode) {
  return render(<SidebarProvider>{node}</SidebarProvider>);
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, media: '', onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

describe('SidebarSubItem', () => {
  it('기본은 동작하는 링크다', () => {
    renderItem(<SidebarSubItem href="/rfp?status=active" label="진행중" />);
    expect(screen.getByRole('link', { name: '진행중' })).toBeInTheDocument();
  });

  it('inert면 aria-disabled 비활성 요소로 렌더한다', () => {
    renderItem(<SidebarSubItem href="/rfp?status=active" label="진행중" inert />);
    expect(screen.queryByRole('link', { name: '진행중' })).toBeNull();
    expect(screen.getByText('진행중').closest('[aria-disabled="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/shell/sidebar/__tests__/SidebarSubItem.test.tsx`
Expected: the `inert` test FAILS.

- [ ] **Step 3: Write minimal implementation**

Add `inert?: boolean` to `SidebarSubItemProps`, then an early return after the `useSidebar()` hook call and before `const link = (...)`:

```tsx
export function SidebarSubItem({
  href, label, shortcut, active = false, onNavigate, inert = false,
}: SidebarSubItemProps) {
  const { state, isMobile } = useSidebar();
  const showTooltip = state === 'expanded' && !isMobile && shortcut != null;

  if (inert) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          subItemBase,
          'text-[var(--md-sys-color-on-surface-variant)] opacity-50 cursor-default select-none',
        )}
      >
        {label}
      </span>
    );
  }

  const link = (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/shell/sidebar/__tests__/SidebarSubItem.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
feat(landing): add inert variant to SidebarSubItem for embedded demo
```

---

### Task 3: Demo nav allowlist

**Files:**
- Modify: `lib/nav/demo-nav-context.tsx`
- Test: `lib/nav/__tests__/demo-nav-context.test.tsx` (exists — append)

**Interfaces:**
- Produces: `DEMO_LIVE_NAV_HREFS: Set<string>` and `isInertDemoNavHref(href: string): boolean` (returns `true` for any href NOT in the live set).

- [ ] **Step 1: Write the failing test**

Append to `lib/nav/__tests__/demo-nav-context.test.tsx`:

```tsx
import { isInertDemoNavHref } from '../demo-nav-context';

describe('isInertDemoNavHref', () => {
  it('스토리 목적지(/home, /rfp, /rfp-create)는 inert가 아니다', () => {
    expect(isInertDemoNavHref('/home')).toBe(false);
    expect(isInertDemoNavHref('/rfp')).toBe(false);
    expect(isInertDemoNavHref('/rfp-create')).toBe(false);
  });

  it('그 밖의 항목(알림/메시지/설정/상태 필터)은 inert다', () => {
    expect(isInertDemoNavHref('/notifications')).toBe(true);
    expect(isInertDemoNavHref('/messages')).toBe(true);
    expect(isInertDemoNavHref('/settings/profile')).toBe(true);
    expect(isInertDemoNavHref('/rfp?status=active')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/nav/__tests__/demo-nav-context.test.tsx`
Expected: FAIL (`isInertDemoNavHref` is not exported).

- [ ] **Step 3: Write minimal implementation**

Add to `lib/nav/demo-nav-context.tsx` (next to `hrefToDemoPage`):

```tsx
// 사이드바에서 인터랙티브하게 유지할 데모 스토리 목적지. 그 밖은 모두 inert(비대화형)로 렌더.
export const DEMO_LIVE_NAV_HREFS = new Set(['/home', '/rfp', '/rfp-create']);

export function isInertDemoNavHref(href: string): boolean {
  return !DEMO_LIVE_NAV_HREFS.has(href);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/nav/__tests__/demo-nav-context.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
feat(landing): add inert demo-nav allowlist helper
```

---

### Task 4: `SidebarSection` inertHref predicate

**Files:**
- Modify: `components/shell/sidebar/SidebarSection.tsx`
- Test: `components/shell/sidebar/__tests__/SidebarSection.demo-nav.test.tsx` (exists — append)

**Interfaces:**
- Consumes: `NavItem`/`SidebarSubItem` `inert` prop (Tasks 1-2); `isInertDemoNavHref` (Task 3).
- Produces: `SidebarSection` gains optional `inertHref?: (href: string) => boolean`. When provided (demo only), the header `NavItem` and each sub-item get `inert={inertHref(href)}`, and the collapse chevron renders as a non-interactive muted span. When absent, behavior is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `SidebarSection.demo-nav.test.tsx`:

```tsx
import { isInertDemoNavHref } from '@/lib/nav/demo-nav-context';

describe('SidebarSection — inertHref(데모 비대화형)', () => {
  it('inertHref가 있으면 라이브 항목은 링크, 비-라이브는 inert로 렌더한다', () => {
    render(
      <SidebarProvider>
        <DemoNavProvider value={{ pathname: '/rfp', search: '', navigate: vi.fn() }}>
          <SidebarSection section={rfpSection} inertHref={isInertDemoNavHref} />
        </DemoNavProvider>
      </SidebarProvider>,
    );
    // 헤더(/rfp)·새 견적 요청(/rfp-create)은 라이브 링크
    expect(screen.getByRole('link', { name: rfpSection.label })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '새 견적 요청' })).toBeInTheDocument();
    // 상태 필터(/rfp?status=...)는 inert → 링크가 아니다
    expect(screen.queryByRole('link', { name: '진행중' })).toBeNull();
    expect(screen.getByText('진행중').closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it('inertHref가 없으면 모든 하위가 링크다 (실 셸 무영향)', () => {
    renderSection({ pathname: '/rfp', search: '', navigate: vi.fn() });
    expect(screen.getByRole('link', { name: '진행중' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/shell/sidebar/__tests__/SidebarSection.demo-nav.test.tsx`
Expected: the inert test FAILS (`inertHref` prop ignored — 진행중 is still a link).

- [ ] **Step 3: Write minimal implementation**

In `SidebarSection.tsx`: add `inertHref` to props, derive `demoInert`, and thread `inert` into the header/sub-items + render the chevron inert in demo mode.

```tsx
import { ChevronDownIcon, ChevronRightIcon } from '@/components/icons';
// ...
type SidebarSectionProps = {
  section: NavSection;
  onNavigate?: () => void;
  inertHref?: (href: string) => boolean;
};

export function SidebarSection({ section, onNavigate, inertHref }: SidebarSectionProps) {
  // ...existing hooks unchanged...
  const demoInert = inertHref != null;
```

Replace the chevron `<button>` with a conditional:

```tsx
      <div className="flex items-center">
        {demoInert ? (
          <span
            aria-hidden
            className="inline-flex h-8 w-6 shrink-0 items-center justify-center text-[var(--md-sys-color-on-surface-variant)] opacity-50 group-data-[collapsible=icon]:hidden"
          >
            <ChevronDownIcon size={14} />
          </span>
        ) : (
          <button
            type="button"
            aria-label={`${section.label} 섹션`}
            aria-expanded={!collapsed}
            onClick={() => toggle(section.id)}
            className="inline-flex h-8 w-6 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:hidden"
          >
            {collapsed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
          </button>
        )}
        <NavItem
          href={section.href}
          label={section.label}
          icon={section.icon}
          shortcut={section.shortcut}
          active={headerActive}
          onNavigate={onNavigate}
          inert={inertHref?.(section.href)}
          className="min-w-0 flex-1"
        />
      </div>
```

Add `inert` to both sub-item maps:

```tsx
          {section.links?.map((link) => (
            <SidebarSubItem
              key={link.href}
              href={link.href}
              label={link.label}
              shortcut={link.shortcut}
              active={isNavHrefActive(pathname, link.href)}
              onNavigate={onNavigate}
              inert={inertHref?.(link.href)}
            />
          ))}
          {section.statuses?.map(({ status: s, label, shortcut }) => (
            <SidebarSubItem
              key={s}
              href={`${section.base}?status=${s}`}
              label={label}
              shortcut={shortcut}
              active={onListBase && status === s}
              onNavigate={onNavigate}
              inert={inertHref?.(`${section.base}?status=${s}`)}
            />
          ))}
```

When `demoInert` and a section happens to be collapsed in the store, force-show children so the inert tree is visible: change the gate to `{(!collapsed || demoInert) && (`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/shell/sidebar/__tests__/SidebarSection.demo-nav.test.tsx`
Expected: PASS (new tests + the three existing regression tests).

- [ ] **Step 5: Commit**

```
feat(landing): thread inert predicate through SidebarSection for demo
```

---

### Task 5: `DemoSidebar` wiring

**Files:**
- Modify: `components/landing/demo-app/DemoSidebar.tsx`
- Test: `components/landing/demo-app/__tests__/DemoSidebar.test.tsx` (exists — update)

**Interfaces:**
- Consumes: `isInertDemoNavHref` (Task 3); `NavItem.inert` (Task 1); `SidebarSection.inertHref` (Task 4).

- [ ] **Step 1: Update the failing tests**

Replace the first two `it(...)` blocks in `DemoSidebar.test.tsx` with:

```tsx
  it('스토리 목적지(홈/견적 요청/새 견적 요청)는 링크로 렌더한다', () => {
    renderSidebar('/home');
    for (const label of ['홈', '견적 요청', '새 견적 요청']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('비-스토리 항목(알림/메시지/설정/상태 필터)은 inert로 렌더한다', () => {
    renderSidebar('/home');
    for (const label of ['알림', '메시지', '설정', '진행중']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
      expect(screen.getByText(label).closest('[aria-disabled="true"]')).not.toBeNull();
    }
  });
```

Keep the existing "워크스페이스 이름…" and "미읽음 알림 배지…" tests. Update the now-wrong "데모 pathname에 따라 활성 항목" test (it asserts 알림 is a link) to assert the home link is active:

```tsx
  it('데모 pathname에 따라 홈이 활성으로 표시된다', () => {
    renderSidebar('/home');
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/demo-app/__tests__/DemoSidebar.test.tsx`
Expected: FAIL (알림/메시지/설정/진행중 are still links).

- [ ] **Step 3: Write minimal implementation**

In `DemoSidebar.tsx`:
- Import `isInertDemoNavHref`: change the import line to `import { useNavPathname, isInertDemoNavHref } from '@/lib/nav/demo-nav-context';`
- Remove `SidebarRail` from the `@/components/ui/sidebar` import and delete the `<SidebarRail />` line.
- Pass `inert` to top items and `inertHref` to sections:

```tsx
          {top.map((item) => (
            <NavItem
              key={item.id}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isNavHrefActive(pathname, item.href)}
              inert={isInertDemoNavHref(item.href)}
            />
          ))}
          {sections.map((section) => (
            <SidebarSection key={section.id} section={section} inertHref={isInertDemoNavHref} />
          ))}
```

- Make the footer non-interactive (presentation only): wrap `SidebarFooterControls`:

```tsx
      <SidebarFooter className="flex-row items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] p-2">
        <div aria-hidden className="pointer-events-none min-w-0 flex-1 opacity-50">
          <SidebarFooterControls className="min-w-0 flex-1" />
        </div>
      </SidebarFooter>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/demo-app/__tests__/DemoSidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
feat(landing): render non-story demo sidebar chrome inert
```

---

### Task 6: `DemoStepBar` component

**Files:**
- Create: `components/landing/demo-app/DemoStepBar.tsx`
- Modify (style only): `app/globals.css` (update the orphaned `.process-progress` comment — optional)
- Test: `components/landing/demo-app/__tests__/DemoStepBar.test.tsx` (create)

**Interfaces:**
- Produces: `DemoStepBar({ current, autoplaying, intervalMs, onSelect, onReplay })` where `current: number` (1-4), `autoplaying: boolean`, `intervalMs: number`, `onSelect: (step: number) => void`, `onReplay: () => void`. Renders 4 named step buttons (accessible names `1 홈`, `2 견적 요청`, `3 견적 비교·선정`, `4 새 견적 요청`), marks `current` with `aria-current="step"`, shows a `처음부터 다시 보기` button only when `!autoplaying`, and an animated fill (`.process-progress`) under the active step only when `autoplaying`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DemoStepBar } from '../DemoStepBar';

const noop = () => {};
const base = { intervalMs: 4500, onSelect: noop, onReplay: noop };

describe('DemoStepBar', () => {
  it('4개 단계를 번호+이름으로 렌더한다', () => {
    render(<DemoStepBar current={1} autoplaying {...base} />);
    for (const name of ['1 홈', '2 견적 요청', '3 견적 비교·선정', '4 새 견적 요청']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('현재 단계를 aria-current=step으로 표시한다', () => {
    render(<DemoStepBar current={3} autoplaying {...base} />);
    expect(screen.getByRole('button', { name: '3 견적 비교·선정' })).toHaveAttribute('aria-current', 'step');
  });

  it('단계 클릭이 onSelect를 그 번호로 호출한다', () => {
    const onSelect = vi.fn();
    render(<DemoStepBar current={1} autoplaying intervalMs={4500} onSelect={onSelect} onReplay={noop} />);
    fireEvent.click(screen.getByRole('button', { name: '4 새 견적 요청' }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it('재생 중에는 다시 보기를 숨기고, 멈추면 노출해 onReplay를 호출한다', () => {
    const onReplay = vi.fn();
    const { rerender } = render(<DemoStepBar current={2} autoplaying intervalMs={4500} onSelect={noop} onReplay={onReplay} />);
    expect(screen.queryByRole('button', { name: '처음부터 다시 보기' })).toBeNull();
    rerender(<DemoStepBar current={4} autoplaying={false} intervalMs={4500} onSelect={noop} onReplay={onReplay} />);
    fireEvent.click(screen.getByRole('button', { name: '처음부터 다시 보기' }));
    expect(onReplay).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/demo-app/__tests__/DemoStepBar.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `components/landing/demo-app/DemoStepBar.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

const STEPS = ['홈', '견적 요청', '견적 비교·선정', '새 견적 요청'] as const;

// 임베디드 데모 가이드 투어의 단계 표시·제어 바. 상태는 DemoAppShell이 소유하고
// 콜백으로 전달한다. autoplaying일 때 활성 단계 아래 진행 막대(.process-progress)가
// intervalMs 동안 채워진다(prefers-reduced-motion 시 CSS가 애니메이션을 생략).
export function DemoStepBar({
  current,
  autoplaying,
  intervalMs,
  onSelect,
  onReplay,
}: {
  current: number;
  autoplaying: boolean;
  intervalMs: number;
  onSelect: (step: number) => void;
  onReplay: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const isActive = step === current;
          return (
            <li key={label} className="min-w-0">
              <button
                type="button"
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(step)}
                className={cn(
                  'relative flex h-8 items-center gap-1.5 overflow-hidden rounded-[var(--md-sys-shape-small)] border px-2.5 text-[13px] transition-colors',
                  isActive
                    ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)]'
                    : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
                )}
              >
                <span className="md-numeric text-[var(--md-sys-color-on-surface-variant)]">{step}</span>
                <span className="truncate">{label}</span>
                {isActive && autoplaying && (
                  <span
                    key={current}
                    aria-hidden
                    className="process-progress absolute bottom-0 left-0 h-[2px] w-full origin-left bg-[var(--md-sys-color-primary)]"
                    style={{ animationDuration: `${intervalMs}ms` }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {!autoplaying && (
        <button
          type="button"
          onClick={onReplay}
          className="h-8 shrink-0 rounded-[var(--md-sys-shape-small)] px-2.5 text-[13px] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-on-surface)]"
        >
          처음부터 다시 보기
        </button>
      )}
    </div>
  );
}
```

(The `.process-progress` keyframe already exists in `app/globals.css` — `scaleX(0)→scaleX(1)`, gated to `prefers-reduced-motion: no-preference`. The inline `animationDuration` overrides its 5000ms default to match `intervalMs`. No CSS change is required; optionally update its comment to mention the demo step bar.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/demo-app/__tests__/DemoStepBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
feat(landing): add DemoStepBar guided-tour control
```

---

### Task 7: `DemoAppShell` takeover rework + step bar

**Files:**
- Modify: `components/landing/demo-app/DemoAppShell.tsx`
- Test: `components/landing/demo-app/__tests__/DemoAppShell.test.tsx` (exists — update)

**Interfaces:**
- Consumes: `DemoStepBar` (Task 6); existing `useDemoStepAutoplay`, `hrefToDemoPage`.

- [ ] **Step 1: Write/adjust the failing tests**

In `DemoAppShell.test.tsx`, change the "데모에 없는 라우트(알림)는 무시한다" test to also assert it no longer freezes the tour, and add a step-bar test:

```tsx
  it('데모에 없는 라우트(알림) 클릭은 페이지를 유지하고 투어도 멈추지 않는다', () => {
    vi.useFakeTimers();
    render(<DemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '알림' }));
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('page-wizard')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('스텝 바 클릭이 페이지를 전환하고 자동 투어를 멈춘다', () => {
    vi.useFakeTimers();
    render(<DemoAppShell />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: '3 견적 비교·선정' })); });
    expect(screen.getByTestId('page-deal')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('page-deal')).toBeInTheDocument();
    vi.useRealTimers();
  });
```

(Remove the old "데모에 없는 라우트(알림)는 무시한다" block it replaces. Keep "사용자가 조작하면 자동 투어가 멈춘다" — it uses `pointerDown` on `page-home`, which stays inside the content area.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/demo-app/__tests__/DemoAppShell.test.tsx`
Expected: the new "알림 클릭은 …투어도 멈추지 않는다" test FAILS (current code freezes on the non-demo click → page stays home, not wizard); the step-bar test FAILS (no step button yet).

- [ ] **Step 3: Write minimal implementation**

In `DemoAppShell.tsx`:
- Import the step bar: `import { DemoStepBar } from './DemoStepBar';`
- Change `navigate` so non-demo hrefs are a no-op (remove the `else setUserInteracted(true)`):

```tsx
  const navigate = useCallback(
    (href: string) => {
      const target = hrefToDemoPage(href);
      // 데모에 없는 라우트(알림/메시지/설정/상태 필터)는 무시 — 페이지 유지·투어 유지.
      if (target) goToPage(target);
    },
    [goToPage],
  );
```

- Add `autoplaying` + `replay`:

```tsx
  const autoplaying = inView && !userInteracted && page < TOTAL_PAGES;
  const replay = useCallback(() => {
    setUserInteracted(false);
    tour.setStep(1);
  }, [tour]);
```

- Remove `onPointerDownCapture={freeze}` and `onKeyDownCapture={freeze}` from the root `<div>` (keep `onClickCapture={onClickCapture}`). Move the freeze onto the content scroll container, and wrap the frame + step bar:

```tsx
  return (
    <DemoNavProvider value={{ pathname: PAGE_PATH[page], search: '', navigate }}>
      <div className="flex flex-col gap-3">
        <div
          ref={rootRef}
          onClickCapture={onClickCapture}
          className="demo-app-window relative h-[600px] overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] [transform:translateZ(0)]"
        >
          <SidebarProvider style={sidebarStyle}>
            <DemoSidebar workspaceName={demoWorkspaceName} />
            <SidebarInset className="flex min-w-0 flex-1 flex-col bg-[var(--shell-chrome-bg)]">
              <MobileShellBar workspaceName={demoWorkspaceName} />
              <div
                onPointerDownCapture={freeze}
                onKeyDownCapture={freeze}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              >
                {page === 1 && <HomePageHost />}
                {page === 2 && <RfpListPageHost onOpenRfp={() => goToPage(3)} />}
                {page === 3 && <DealRoomPageHost />}
                {page === 4 && <WizardPageHost enabled={inView && !userInteracted} />}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
        <DemoStepBar
          current={page}
          autoplaying={autoplaying}
          intervalMs={PAGE_AUTO_MS}
          onSelect={goToPage}
          onReplay={replay}
        />
      </div>
    </DemoNavProvider>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/demo-app/__tests__/DemoAppShell.test.tsx`
Expected: PASS (all blocks, including the existing autoplay/freeze tests).

- [ ] **Step 5: Commit**

```
feat(landing): rework demo takeover model and mount step bar
```

---

### Task 8: `LandingHero` section heading + intro

**Files:**
- Modify: `components/landing/LandingHero.tsx`
- Test: `components/landing/LandingHero.test.tsx` (exists — repurpose one test)

**Interfaces:**
- Consumes: existing `SectionHeading`.

- [ ] **Step 1: Repurpose the failing test**

Replace the `drops the standalone process section heading` test (lines ~63-66) with:

```tsx
  it('labels the demo/process section with a heading and intro', () => {
    render(<LandingHero />)
    expect(screen.getByText('실제 화면을 미리 둘러보세요')).toBeInTheDocument()
    expect(screen.getByText(/직접 둘러보세요/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/LandingHero.test.tsx`
Expected: FAIL (heading/intro not present).

- [ ] **Step 3: Write minimal implementation**

In `LandingHero.tsx`, update the `#process` section to add the heading + intro above `<DemoAppShell />`:

```tsx
        {/* ── Process: 실제 대시보드를 그대로 체험하는 임베디드 데모 ── */}
        <section id="process" className={sectionCls}>
          <div className={containerCls}>
            <div className="flex flex-col gap-[var(--s-4)]">
              <SectionHeading>실제 화면을 미리 둘러보세요</SectionHeading>
              <p className="text-[var(--text-md)] leading-[1.68] text-[var(--md-sys-color-on-surface-variant)]">
                회원가입 없이 SupporterB 실제 화면을 그대로 체험할 수 있어요. 아래 단계를 눌러 직접 둘러보세요.
              </p>
            </div>
            <DemoAppShell />
          </div>
        </section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/LandingHero.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
feat(landing): add heading and intro to the demo/process section
```

---

### Task 9: Full green + health

- [ ] **Step 1: Run the full suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors. (Watch for the now-unused `SidebarRail` import in `DemoSidebar.tsx` and unused `ChevronRightIcon` if any — remove orphans your changes created.)

- [ ] **Step 3: Commit any fixups**

```
chore(landing): typecheck/lint fixups for guided-tour demo
```

## Self-Review

**Spec coverage:**
- §1 Section framing → Task 8. ✓
- §2 DemoStepBar → Task 6 (+ mounted in Task 7). ✓
- §3 Inert chrome (NavItem/SubItem prop, allowlist, DemoSidebar, rail drop, footer) → Tasks 1,2,3,4,5. ✓
- §4 Takeover model → Task 7. ✓
- §5 Replay/end state → Task 6 (`onReplay`/replay button) + Task 7 (`replay`/`autoplaying`). ✓
- §Tests → each task's RED step. ✓

**Placeholder scan:** none — every step carries concrete code/commands.

**Type consistency:** `inert?: boolean` used identically in Tasks 1-2 and consumed in 4-5; `inertHref?: (href: string) => boolean` defined in Task 4 and passed in Task 5; `isInertDemoNavHref` signature defined in Task 3 and used in 4-5; `DemoStepBar` prop names (`current`, `autoplaying`, `intervalMs`, `onSelect`, `onReplay`) identical in Tasks 6 and 7; `autoplaying = inView && !userInteracted && page < TOTAL_PAGES` and `replay` defined and consumed in Task 7. ✓
