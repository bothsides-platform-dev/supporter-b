# Landing Demo — Guided-Tour Refinement

**Date:** 2026-06-30
**Branch:** feat/landing-buyer-refinements
**Status:** Design approved, ready for implementation plan

## Problem

The embedded landing demo (`components/landing/demo-app/DemoAppShell.tsx`, in the
`#process` section of `LandingHero`) renders the **full real buyer app chrome**
(complete sidebar + 4 real pages) and auto-plays through the pages until the
visitor touches anything. Three problems result, all from the same root cause —
the demo is too much "real app," not enough "guided demo":

1. **Dead clicks.** Only 4 destinations do anything (홈 → page 1, 견적 요청 →
   page 2, 새 견적 요청 → page 4, RFP row → page 3). Clicking 알림 / 메시지 /
   설정 / 프로필·멤버·활동 기록 silently freezes the auto-tour with no visible
   effect. The 견적 요청 status filters (진행중/마감/선정 완료) all route to the
   same unfiltered list — feels broken.
2. **Unnecessary interactivity.** The demo exposes interactive chrome that isn't
   part of the story (status filters, collapse rail, section chevrons, footer
   controls, workspace switcher mock).
3. **No indication.** The section has no `SectionHeading` and no caption — every
   other landing section has one. A visitor doesn't know it's a live product
   preview, that it auto-plays, or that they can click to explore.

## Decision

Make the demo a **labeled, watch-first guided tour**:
- Auto-plays the 4 screens when scrolled into view (existing behavior kept).
- A **named step bar** below the frame names each screen and lets the visitor
  click to drive it.
- All non-story chrome stays **visible but inert** (real-product look, zero dead
  clicks).
- Clear section heading + one-line instruction.

Chosen over a fully-interactive sandbox (too many things to make real) and over
trimming the sidebar to story-only (loses the "this is the real product" feel).

## Scope

### In scope
- `LandingHero` `#process` section: add heading + intro line.
- New `DemoStepBar` presentational component + its placement in `DemoAppShell`.
- `DemoAppShell`: takeover model rework (see §4).
- `DemoSidebar`: render non-story items inert, drop rail, inert footer/chevrons.
- `NavItem` / `SidebarSubItem`: add opt-in `inert` prop (default off).
- `demo-nav-context`: add the live-href allowlist.

### Out of scope (unchanged)
- In-page components: `HomeDashboard`, `RfpListTable`, `FocusComparison`,
  `RfpCreateWizard` and their fixtures.
- `MobileShellBar` and mobile behavior.
- Step order / page content / fixtures.
- `setRfpBoardVisibilityAction` and any server code.

## Design

### 1. Section framing (`LandingHero.tsx`)
The `#process` section gains, above `<DemoAppShell />`, inside the existing
`containerCls`:
- `SectionHeading`: **실제 화면을 미리 둘러보세요**
- Muted `<p>` (same style as the Pricing section's sub-paragraph):
  **회원가입 없이 SupporterB 실제 화면을 그대로 체험할 수 있어요. 아래 단계를 눌러 직접 둘러보세요.**

### 2. `DemoStepBar` (new presentational component)
`components/landing/demo-app/DemoStepBar.tsx`. Pure presentation; state owned by
`DemoAppShell`.

Props:
```ts
{
  current: number;            // 1..4
  total: number;              // 4
  autoplaying: boolean;       // drives progress-fill animation
  intervalMs: number;         // PAGE_AUTO_MS, for the fill animation duration
  onSelect: (step: number) => void;
  onReplay: () => void;
}
```
- 4 step buttons, labels: **① 홈 · ② 견적 요청 · ③ 견적 비교·선정 · ④ 새 견적 요청**.
- Current step visually highlighted (primary); each button is clickable.
- Progress fill animates across the active step over `intervalMs` while
  `autoplaying`; static otherwise.
- A **처음부터 다시 보기** replay control is shown when the tour has reached the
  last step or autoplay has stopped; calls `onReplay`.
- `prefers-reduced-motion`: no fill animation; bar still fully clickable.
- Linear design language: 6px radius, `outline-variant` borders, `.md-numeric`
  on the step numerals, no pill shapes, no shadow.

### 3. Inert non-story chrome
Allowlist (single source of truth, in `demo-nav-context.tsx`):
```ts
export const DEMO_LIVE_NAV_HREFS = new Set(['/home', '/rfp', '/rfp-create']);
export function isInertDemoNavHref(href: string): boolean {
  return !DEMO_LIVE_NAV_HREFS.has(href);
}
```
(The in-page RFP-row click reaches the deal room — not a sidebar item, so not in
this set.)

`NavItem` / `SidebarSubItem` gain an optional `inert?: boolean` (default
`false`). When `true`, instead of a `next/link` `<Link>` they render a
non-interactive element:
- a `<span>` (not an anchor), `aria-disabled="true"`, no `href`, not focusable
  (no tab stop),
- muted styling: `text-on-surface-variant` + reduced opacity, `cursor-default`,
  `select-none`, **no** hover background/text classes,
- same box/spacing as the live variant so layout is identical.

When `inert` is unset (the entire real shell), behavior is byte-for-byte
unchanged.

`DemoSidebar`:
- Top items (홈/알림/메시지): pass `inert={isInertDemoNavHref(item.href)}` →
  only 홈 stays live.
- Sections (견적 요청 / 설정): the section needs per-part inert decisions. The
  `견적 요청` header (`/rfp`) is live; its status sub-items are inert; the `설정`
  header and all its links are inert. Pass an `inertHref?: (href) => boolean`
  predicate into `SidebarSection` (optional; absent for the real shell). When
  present, `SidebarSection` renders its header `NavItem` and each
  `SidebarSubItem` with `inert={inertHref(href)}`, and renders the collapse
  chevron as a non-interactive element (demo only).
- Drop `<SidebarRail />` in the demo sidebar.
- Make the footer (`SidebarFooterControls`) non-interactive: wrap in a
  `pointer-events-none` + muted, `aria-hidden` container (presentation only).

### 4. Takeover model (`DemoAppShell`)
Remove the broad root `onPointerDownCapture={freeze}` / `onKeyDownCapture={freeze}`.
Replace with:
- **Step bar** `onSelect(step)` → `goToPage(step)` (sets `userInteracted`,
  stops autoplay) and `onReplay()` → reset to step 1 + resume autoplay
  (`setUserInteracted(false)` + `tour.setStep(1)`; autoplay re-enables because
  `inView && !userInteracted`).
- **Live sidebar nav / in-page links**: keep `onClickCapture` for `a[href]`, but
  `navigate(href)` only takes over for **live** demo destinations; a click that
  maps to no demo page is a **no-op** (no freeze) — inert items aren't anchors
  anyway, this just hardens the path.
- **Content-area interaction**: move the pointer/key freeze onto the page
  content `<div>` (the scroll container wrapping the 4 pages) so deal-room tabs,
  the wizard, and RFP rows still hand control to the visitor, while sidebar
  pointer events never do.

Net effect: inert chrome never changes the page and never freezes the tour;
every takeover is an intentional, visible action.

### 5. Replay / end state
- Autoplay advances 1→2→3→4 then stops at 4 (existing hook).
- The step bar shows the replay control once stopped or at step 4.
- Replay returns to step 1 and resumes auto-advance.

## Tests (TDD — RED first for each)

- **`DemoStepBar`**: renders 4 labeled steps; marks `current`; `onSelect` fires
  with the clicked step; `onReplay` fires from the replay control; no progress
  animation under reduced-motion (assert via the reduced-motion branch / class).
- **`NavItem` / `SidebarSubItem`**: `inert` → renders `aria-disabled`,
  non-anchor, no `href`, not in tab order; default (no `inert`) → working link.
- **`DemoSidebar`**: 홈/견적 요청/새 견적 요청 are links; 알림·메시지·설정·status
  filters are inert; no `SidebarRail`.
- **`DemoAppShell`**: clicking an inert nav item does not change page and does
  not stop autoplay; clicking a `DemoStepBar` step changes page and stops
  autoplay; interacting with page content stops autoplay.
- Update existing `DemoAppShell.test.tsx` / `DemoSidebar.test.tsx` to the new
  model.

## Risks / notes

- `SidebarSection` is shared with the real shell. The `inertHref` predicate is
  optional and unused in production, so the real sidebar is unaffected — covered
  by leaving existing `SidebarSection` tests green.
- The content-scoped freeze must not fire on simple scroll-only gestures more
  than is acceptable; treating "reach into the content" as takeover is
  intended and acceptable.
- Reduced-motion path already exists in `useDemoStepAutoplay` (initial
  `stopped = prefersReducedMotion()`); the step bar must be usable in that state.
