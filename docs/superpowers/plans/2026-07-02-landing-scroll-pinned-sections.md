# 랜딩 스크롤 연동 pin 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜딩(구매사·PG)의 Problem·Solution·Demo 섹션을 `position: sticky` + `motion/react` `useScroll`로 스크롤에 반응해 단계가 넘어가는 pin 섹션으로 만든다.

**Architecture:** 공용 render-prop 컴포넌트 `ScrollPinnedSection`이 sticky 트랙 + 스크롤 진행률을 소유하고 `activeStep`·연속 `progress`·`scrollToStep`을 자식에 넘긴다. reduced-motion·모바일·마운트 전에는 pin 없이 오늘의 마크업으로 폴백한다. Demo는 스텝=스크롤 함수로 두고 클릭을 "해당 스텝으로 smooth scroll"로 통일해 클릭·스크롤을 한 타임라인으로 묶는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, `motion@12` (`motion/react`), Vitest.

## Global Constraints

- **TDD 면제(랜딩 관례)**: CLAUDE.md + 프로젝트 메모리에 따라 순수 시각/모션 변경은 실패 테스트 선행 없이 눈으로 튜닝(+`/design-review`)한다. **단** ① 유닛 스위트 전부 green ② `pnpm tsc --noEmit` 0 ③ `pnpm lint` 0 을 항상 유지한다. 로직/상태를 바꾸는 `SolutionShowcase` 리팩터는 테스트를 먼저 갱신한다.
- **모션 규칙(DESIGN.md §6·§9)**: `transform`·`opacity`만 애니메이트(레이아웃 속성 금지). 확대는 `transform: scale`. `prefers-reduced-motion: reduce` 존중.
- **신규 의존성 금지**: `motion/react`만 사용(이미 설치됨). GSAP·Lenis 등 도입 안 함.
- **motion import 경로**: 항상 `from 'motion/react'` (구 framer-motion 아님).
- **sticky top offset**: 고정 헤더 아래 `top-[var(--shell-topbar)]`.
- **기본 동작 불변**: `DemoAppShell`/`PgDemoAppShell`은 신규 prop 미제공 시 오늘과 100% 동일해야 한다(기존 `DemoAppShell.test` green).
- **커밋 메시지 트레일러**: 각 커밋 메시지 끝에 아래 2줄을 붙인다.
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UJAU1iDAMvLMYqKZGq2Dxa
  ```
- **워크트리 참고**: 이미 origin/dev 기반 + `node_modules` 심링크 완료. `.githooks/pre-commit`가 변경 파일 대상 lint+tsc를 돌린다(정상). `--no-verify` 사용 금지(막히면 사용자에게 문의).
- **단위 테스트 실행**: `pnpm test <path>` (단일 파일 RED/GREEN). 전체 green 확인은 `pnpm test`.

---

### Task 1: 공용 이징 상수 추출

**Files:**
- Create: `lib/landing/ease.ts`

**Interfaces:**
- Produces: `export const EASE_OUT: readonly [number, number, number, number]` — 값 `[0.16, 1, 0.3, 1]`. 신규 모션 코드(Task 5)가 import.

- [ ] **Step 1: 상수 파일 작성**

```ts
// lib/landing/ease.ts
// 랜딩 모션 공용 ease-out 곡선. 여러 랜딩 컴포넌트가 개별 선언하던 값을 한곳으로 모은다.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
```

- [ ] **Step 2: 타입 확인**

Run: `pnpm tsc --noEmit`
Expected: 에러 0 (신규 파일만 추가).

- [ ] **Step 3: 커밋**

```bash
git add lib/landing/ease.ts
git commit -m "feat(landing): 공용 EASE_OUT 이징 상수 추출"
```

---

### Task 2: `ScrollPinnedSection` 공용 프리미티브

**Files:**
- Create: `components/landing/ScrollPinnedSection.tsx`
- Test: `components/landing/__tests__/ScrollPinnedSection.test.tsx`

**Interfaces:**
- Consumes: `useIsLgUp` (`@/hooks/use-lg-up`), `prefersReducedMotion` (`@/lib/landing/prefers-reduced-motion`).
- Produces:
  - `type PinnedState = { pinned: boolean; activeStep: number; progress: MotionValue<number> | null; scrollToStep: (index: number) => void }`
  - `function ScrollPinnedSection(props: { steps: number; stepVh?: number; className?: string; children: (s: PinnedState) => ReactNode }): JSX.Element`
  - 폴백(`pinned:false`) 시 `activeStep = steps - 1`, `progress = null`, `scrollToStep = () => {}`.

- [ ] **Step 1: 폴백 렌더 테스트 작성 (jsdom = 항상 폴백)**

```tsx
// components/landing/__tests__/ScrollPinnedSection.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';

describe('ScrollPinnedSection', () => {
  it('reduced-motion(jsdom)에서는 pin 없이 children을 폴백으로 렌더한다', () => {
    render(
      <ScrollPinnedSection steps={4}>
        {({ pinned, activeStep }) => (
          <div>
            <span data-testid="pinned">{String(pinned)}</span>
            <span data-testid="step">{activeStep}</span>
          </div>
        )}
      </ScrollPinnedSection>,
    );
    // jsdom엔 matchMedia 없음 → prefersReducedMotion()=true → motionOk=false → 폴백
    expect(screen.getByTestId('pinned').textContent).toBe('false');
    expect(screen.getByTestId('step').textContent).toBe('3'); // steps-1
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test components/landing/__tests__/ScrollPinnedSection.test.tsx`
Expected: FAIL — `ScrollPinnedSection` 모듈 없음.

- [ ] **Step 3: 컴포넌트 구현**

```tsx
// components/landing/ScrollPinnedSection.tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useScroll, useMotionValueEvent, type MotionValue } from 'motion/react';
import { useIsLgUp } from '@/hooks/use-lg-up';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

export type PinnedState = {
  pinned: boolean;
  activeStep: number;
  progress: MotionValue<number> | null;
  scrollToStep: (index: number) => void;
};

// 섹션을 스크롤 동안 화면에 고정(pin)하고, 트랙 진행률(0→1)로 이산 단계(0..steps-1)와
// 연속 progress를 자식에 넘긴다. reduced-motion·모바일(<lg)·마운트 전에는 pin 없이 폴백
// 렌더(소비처가 오늘의 정적 마크업을 그림). 스크롤을 가로채지 않는 sticky 방식.
export function ScrollPinnedSection({
  steps,
  stepVh = 80,
  className,
  children,
}: {
  steps: number;
  stepVh?: number;
  className?: string;
  children: (s: PinnedState) => ReactNode;
}) {
  const lgUp = useIsLgUp();
  // motionOk는 false로 시작 → SSR·첫 클라 렌더는 항상 폴백(하이드레이션 미스매치 방지).
  // 마운트 후 reduced-motion이 아니면 true로 승격.
  const [motionOk, setMotionOk] = useState(false);
  useEffect(() => {
    setMotionOk(!prefersReducedMotion());
  }, []);
  const pinned = lgUp && motionOk;

  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });
  const [activeStep, setActiveStep] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const s = Math.min(steps - 1, Math.max(0, Math.floor(v * steps)));
    setActiveStep(s);
  });

  const scrollToStep = (index: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = window.scrollY + rect.top + ((index + 0.5) / steps) * rect.height;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  if (!pinned) {
    return (
      <>
        {children({
          pinned: false,
          activeStep: steps - 1,
          progress: null,
          scrollToStep: () => {},
        })}
      </>
    );
  }

  return (
    <div ref={trackRef} style={{ height: `${steps * stepVh}vh` }}>
      <div
        className={`sticky top-[var(--shell-topbar)] flex min-h-[calc(100svh-var(--shell-topbar))] flex-col justify-center ${className ?? ''}`}
      >
        {children({ pinned: true, activeStep, progress: scrollYProgress, scrollToStep })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/landing/__tests__/ScrollPinnedSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: 타입·린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 0 에러.

- [ ] **Step 6: 커밋**

```bash
git add components/landing/ScrollPinnedSection.tsx components/landing/__tests__/ScrollPinnedSection.test.tsx
git commit -m "feat(landing): ScrollPinnedSection sticky 스크롤-스텝퍼 프리미티브 추가"
```

---

### Task 3: `SolutionShowcase` → controlled (타이머 제거)

기존 타이머 자동 순환을 제거하고 `activeStep` prop으로 외부 구동되게 바꾼다. 로직 변경이라 테스트를 먼저 새 모델로 갱신한다.

**Files:**
- Modify: `components/landing/SolutionShowcase.tsx`
- Test: `components/landing/__tests__/SolutionShowcase.test.tsx` (재작성)

**Interfaces:**
- Produces: `function SolutionShowcase(props: { points: string[]; activeStep?: number | null }): JSX.Element`
  - `activeStep` 미제공/`null` → 모든 포인트 평평(강조·디밍 없음), 표 중립.
  - `activeStep = i` → 인덱스 `i` 강조(`data-active="true"`), 나머지 `opacity: 0.4`, 표에 `activeStep` 전달.
  - 내부 타이머/`useInView`/`setInterval` 없음.

- [ ] **Step 1: 테스트를 controlled 모델로 재작성**

```tsx
// components/landing/__tests__/SolutionShowcase.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SolutionShowcase } from '@/components/landing/SolutionShowcase';

const POINTS = ['첫째 포인트', '둘째 포인트', '셋째 포인트'];

describe('SolutionShowcase (controlled)', () => {
  it('activeStep 미제공 시 모든 포인트가 평평(강조 없음)하다', () => {
    render(<SolutionShowcase points={POINTS} />);
    for (const p of POINTS) {
      const li = screen.getByText(p).closest('li') as HTMLLIElement;
      expect(li.getAttribute('data-active')).toBeNull();
      expect(li.style.opacity).toBe('1');
    }
  });

  it('activeStep=1이면 해당 포인트만 강조하고 나머지는 디밍한다', () => {
    render(<SolutionShowcase points={POINTS} activeStep={1} />);
    const active = screen.getByText(POINTS[1]).closest('li') as HTMLLIElement;
    const other = screen.getByText(POINTS[0]).closest('li') as HTMLLIElement;
    expect(active.getAttribute('data-active')).toBe('true');
    expect(other.getAttribute('data-active')).toBeNull();
    expect(other.style.opacity).toBe('0.4');
  });

  it('타이머 없이 activeStep 변화에만 반응한다(리렌더)', () => {
    const { rerender } = render(<SolutionShowcase points={POINTS} activeStep={0} />);
    expect((screen.getByText(POINTS[0]).closest('li') as HTMLLIElement).getAttribute('data-active')).toBe('true');
    rerender(<SolutionShowcase points={POINTS} activeStep={2} />);
    expect((screen.getByText(POINTS[2]).closest('li') as HTMLLIElement).getAttribute('data-active')).toBe('true');
    expect((screen.getByText(POINTS[0]).closest('li') as HTMLLIElement).getAttribute('data-active')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인 (기존 타이머 구현과 불일치)**

Run: `pnpm test components/landing/__tests__/SolutionShowcase.test.tsx`
Expected: FAIL — 현재 컴포넌트는 `activeStep` prop을 받지 않고 타이머로만 움직임.

- [ ] **Step 3: 컴포넌트를 controlled로 구현**

```tsx
// components/landing/SolutionShowcase.tsx
'use client';

import { CheckIcon } from '@/components/icons';
import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';

// 해결 포인트 목록과 비교표를 하나의 activeStep으로 묶어 연동한다. 구동원은 외부(스크롤).
// activeStep=i면 그 포인트를 강조(나머지 흐리게)하고, 같은 신호를 표에 내려 컬럼/추천행을
// 하이라이트한다. activeStep이 없으면(null) 모두 평평하게(강조 없이) 보여준다.
export function SolutionShowcase({
  points,
  activeStep = null,
}: {
  points: string[];
  activeStep?: number | null;
}) {
  return (
    <div className="flex flex-col gap-[var(--s-8)]">
      <ul className="flex flex-col gap-[var(--s-5)]">
        {points.map((point, i) => {
          const isActive = activeStep === i;
          const dim = activeStep !== null && !isActive;
          return (
            <li
              key={point}
              data-active={isActive ? 'true' : undefined}
              className="flex items-start gap-[var(--s-4)] transition-opacity duration-500"
              style={{ opacity: dim ? 0.4 : 1 }}
            >
              <span
                aria-hidden
                className={[
                  'mt-0.5 shrink-0 grid place-items-center h-5 w-5 rounded-full',
                  'transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                  isActive
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                    : 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)]',
                ].join(' ')}
                style={{
                  transform: isActive ? 'scale(1.18)' : 'scale(1)',
                  boxShadow: isActive
                    ? '0 0 0 4px color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent)'
                    : 'none',
                }}
              >
                <CheckIcon size={13} />
              </span>
              <span
                className={[
                  'text-[var(--text-md)] leading-[1.6] tracking-[-0.006em] transition-colors duration-300',
                  isActive
                    ? 'text-[var(--md-sys-color-on-surface)] font-medium'
                    : 'text-[var(--md-sys-color-on-surface)]',
                ].join(' ')}
              >
                {point}
              </span>
            </li>
          );
        })}
      </ul>
      <OfferComparisonTable activeStep={activeStep} />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/landing/__tests__/SolutionShowcase.test.tsx`
Expected: PASS (3건).

- [ ] **Step 5: 타입·린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 0 에러. (`useState`/`useEffect`/`useInView`/`useRef`/`prefersReducedMotion` import 제거 확인 — 미사용 import lint 에러 나지 않게.)

- [ ] **Step 6: 커밋**

```bash
git add components/landing/SolutionShowcase.tsx components/landing/__tests__/SolutionShowcase.test.tsx
git commit -m "refactor(landing): SolutionShowcase 타이머 제거·activeStep controlled 전환"
```

---

### Task 4: 데모 셸 controlled 모드 prop 추가 (`DemoAppShell` + `PgDemoAppShell`)

두 셸에 동일한 옵셔널 prop을 추가한다. **미제공 시 오늘과 100% 동일.**

**Files:**
- Modify: `components/landing/demo-app/DemoAppShell.tsx`
- Modify: `components/landing/demo-app/PgDemoAppShell.tsx`

**Interfaces:**
- Produces (양쪽 동일 시그니처):
  ```ts
  type DemoControlProps = {
    controlledStep?: number;          // 1..TOTAL_PAGES. 제공되면 이 페이지 렌더 + 자동재생/클릭-네비 내부 setState 비활성
    onStepSelect?: (n: number) => void; // 내부 nav/StepBar 클릭 시 호출(래퍼가 scrollToStep으로 연결)
    scrollLocked?: boolean;           // true면 내부 스크롤 영역 overflow-hidden
  };
  function DemoAppShell(props?: DemoControlProps): JSX.Element
  function PgDemoAppShell(props?: DemoControlProps): JSX.Element
  ```

- [ ] **Step 1: `DemoAppShell` 시그니처·구동부 수정**

`components/landing/demo-app/DemoAppShell.tsx`의 `export function DemoAppShell() {` 부터 `const page = tour.step;` 까지, 그리고 `goToPage`/`autoplaying`/`guiding`/`replay` 정의를 아래로 교체한다:

```tsx
export function DemoAppShell({
  controlledStep,
  onStepSelect,
  scrollLocked,
}: {
  controlledStep?: number;
  onStepSelect?: (n: number) => void;
  scrollLocked?: boolean;
} = {}) {
  const controlled = controlledStep != null;
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const [userInteracted, setUserInteracted] = useState(false);

  // controlled(스크롤 구동)면 내부 타이머 자동재생을 끈다.
  const tour = useDemoStepAutoplay(TOTAL_PAGES, PAGE_AUTO_MS, !controlled && inView && !userInteracted);
  // controlledStep은 number | undefined — ?? 로 좁혀 page를 항상 number로 유지(TS narrowing).
  const page = controlledStep ?? tour.step;

  const freeze = useCallback(() => setUserInteracted(true), []);

  const goToPage = useCallback(
    (n: number) => {
      if (controlled) {
        // 클릭 = "그 스텝으로 스크롤" — 실제 페이지 전환은 스크롤이 되돌려준다.
        onStepSelect?.(n);
        return;
      }
      setUserInteracted(true);
      tour.setStep(n);
    },
    [controlled, onStepSelect, tour],
  );

  const navigate = useCallback(
    (href: string) => {
      const target = hrefToDemoPage(href);
      if (target) goToPage(target);
    },
    [goToPage],
  );

  const autoplaying = !controlled && inView && !userInteracted && page < TOTAL_PAGES;
  const guiding = !controlled && inView && !userInteracted;
  const replay = useCallback(() => {
    if (controlled) {
      onStepSelect?.(1);
      return;
    }
    setUserInteracted(false);
    tour.setStep(1);
  }, [controlled, onStepSelect, tour]);
```

- [ ] **Step 2: 내부 스크롤 영역에 `scrollLocked` 반영**

같은 파일에서 데모 콘텐츠 래퍼(`onPointerDownCapture={freeze}` 가 달린 `div`)의 className을 교체:

```tsx
              <div
                onPointerDownCapture={freeze}
                onKeyDownCapture={freeze}
                className={`min-h-0 min-w-0 flex-1 ${scrollLocked ? 'overflow-hidden' : 'overflow-y-auto'}`}
              >
```

- [ ] **Step 3: `PgDemoAppShell`에 동일 변경 적용**

`components/landing/demo-app/PgDemoAppShell.tsx`도 Step 1·2와 동일하게 수정한다. 단 PG는 내부 콘텐츠 래퍼가 `onPointerDownCapture={() => setUserInteracted(true)}` 인라인이므로, 그 className만 아래로 교체하고(핸들러 유지), 함수 시그니처·`controlled`·`page`·`goToPage`·`autoplaying`·`guiding`·`replay`는 Step 1과 동일 패턴으로 바꾼다:

```tsx
              <div
                onPointerDownCapture={() => setUserInteracted(true)}
                onKeyDownCapture={() => setUserInteracted(true)}
                className={`min-h-0 min-w-0 flex-1 ${scrollLocked ? 'overflow-hidden' : 'overflow-y-auto'}`}
              >
```

- [ ] **Step 4: 기존 데모 테스트 green 확인 (기본 동작 불변)**

Run: `pnpm test components/landing/demo-app/__tests__/DemoAppShell.test.tsx components/landing/__tests__/PgLanding.test.tsx`
Expected: PASS (prop 미제공 경로 = 오늘과 동일).

- [ ] **Step 5: 타입·린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 0 에러.

- [ ] **Step 6: 커밋**

```bash
git add components/landing/demo-app/DemoAppShell.tsx components/landing/demo-app/PgDemoAppShell.tsx
git commit -m "feat(landing): 데모 셸 controlled(scroll-driven) 모드 prop 추가"
```

---

### Task 5: `ScrollDrivenProblem` 공용 컴포넌트 (누적 등장)

Problem 섹션 내용을 pin(누적 등장)/폴백(FadeInView 스택) 양쪽으로 렌더. 구매사·PG 공용.

**Files:**
- Create: `components/landing/scroll-pinned/ScrollDrivenProblem.tsx`

**Interfaces:**
- Consumes: `ScrollPinnedSection` (Task 2), `ProblemCard`, `FadeInView`, `EASE_OUT` (Task 1), `motion/react`.
- Produces: `function ScrollDrivenProblem(props: { heading: ReactNode; intro?: ReactNode; items: { num: string; title: string; desc: string }[]; stagger?: number }): JSX.Element`

- [ ] **Step 1: 컴포넌트 구현**

```tsx
// components/landing/scroll-pinned/ScrollDrivenProblem.tsx
'use client';

import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { ProblemCard } from '@/components/landing/ProblemCard';
import { FadeInView } from '@/components/landing/FadeInView';
import { EASE_OUT } from '@/lib/landing/ease';

type Item = { num: string; title: string; desc: string };

// Problem 섹션: pin일 때 카드가 스크롤에 따라 1→2→3→4 누적 등장(i<=activeStep이면 표시),
// 폴백일 때 오늘의 FadeInView 스택. 헤딩(과 선택적 intro)은 위에 고정.
export function ScrollDrivenProblem({
  heading,
  intro,
  items,
  stagger = 0.08,
}: {
  heading: ReactNode;
  intro?: ReactNode;
  items: Item[];
  stagger?: number;
}) {
  return (
    <ScrollPinnedSection steps={items.length}>
      {({ pinned, activeStep }) => (
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-9)]">
          <div className="flex flex-col gap-[var(--s-5)]">
            {heading}
            {intro}
          </div>
          <div className="flex flex-col gap-[var(--s-4)]">
            {items.map((item, i) =>
              pinned ? (
                <motion.div
                  key={item.num}
                  animate={{ opacity: i <= activeStep ? 1 : 0, y: i <= activeStep ? 0 : 16 }}
                  transition={{ duration: 0.36, ease: EASE_OUT }}
                >
                  <ProblemCard num={item.num} title={item.title} desc={item.desc} />
                </motion.div>
              ) : (
                <FadeInView key={item.num} delay={i * stagger}>
                  <ProblemCard num={item.num} title={item.title} desc={item.desc} />
                </FadeInView>
              ),
            )}
          </div>
        </div>
      )}
    </ScrollPinnedSection>
  );
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 0 에러.

- [ ] **Step 3: 커밋**

```bash
git add components/landing/scroll-pinned/ScrollDrivenProblem.tsx
git commit -m "feat(landing): ScrollDrivenProblem 누적 등장 컴포넌트 추가"
```

---

### Task 6: `ScrollDrivenDemo` + `PinnedDemoFrame` (확대 + 클릭·스크롤 연동)

Demo 섹션을 pin(스크롤 구동 + 0.95→1.0 확대 + 클릭=scrollToStep)/폴백(오늘의 데모)으로 렌더. 구매사·PG 공용(데모 렌더는 prop 주입).

**Files:**
- Create: `components/landing/scroll-pinned/ScrollDrivenDemo.tsx`

**Interfaces:**
- Consumes: `ScrollPinnedSection` (Task 2), Task 4의 `DemoControlProps`, `motion/react` (`motion`, `useTransform`).
- Produces:
  - `type DemoControlProps = { controlledStep?: number; onStepSelect?: (n: number) => void; scrollLocked?: boolean }`
  - `function ScrollDrivenDemo(props: { renderDemo: (p: DemoControlProps) => ReactNode }): JSX.Element`

- [ ] **Step 1: 컴포넌트 구현**

```tsx
// components/landing/scroll-pinned/ScrollDrivenDemo.tsx
'use client';

import { type ReactNode } from 'react';
import { motion, useTransform, type MotionValue } from 'motion/react';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';

export type DemoControlProps = {
  controlledStep?: number;
  onStepSelect?: (n: number) => void;
  scrollLocked?: boolean;
};

// Demo 섹션: pin일 때 스크롤이 데모 스텝(1→4)을 구동하고 목업이 0.95→1.0으로 살짝 커진다.
// 데모 내부 클릭/StepBar는 onStepSelect→scrollToStep으로 연결돼 클릭·스크롤이 한 타임라인.
// 폴백일 때 오늘의 데모(자동재생+자유 클릭) 그대로.
export function ScrollDrivenDemo({
  renderDemo,
}: {
  renderDemo: (p: DemoControlProps) => ReactNode;
}) {
  return (
    <ScrollPinnedSection steps={4}>
      {({ pinned, activeStep, progress, scrollToStep }) =>
        pinned && progress ? (
          <PinnedDemoFrame
            progress={progress}
            step={activeStep}
            scrollToStep={scrollToStep}
            renderDemo={renderDemo}
          />
        ) : (
          renderDemo({})
        )
      }
    </ScrollPinnedSection>
  );
}

// progress→scale은 훅이라 별도 컴포넌트에서 무조건 호출(렌더-프롭 안 조건부 훅 회피).
function PinnedDemoFrame({
  progress,
  step,
  scrollToStep,
  renderDemo,
}: {
  progress: MotionValue<number>;
  step: number;
  scrollToStep: (index: number) => void;
  renderDemo: (p: DemoControlProps) => ReactNode;
}) {
  const scale = useTransform(progress, [0, 1], [0.95, 1]);
  return (
    <motion.div style={{ scale, willChange: 'transform' }} className="mx-auto w-full max-w-[1080px]">
      {renderDemo({
        controlledStep: step + 1,
        onStepSelect: (n) => scrollToStep(n - 1),
        scrollLocked: true,
      })}
    </motion.div>
  );
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 0 에러.

- [ ] **Step 3: 커밋**

```bash
git add components/landing/scroll-pinned/ScrollDrivenDemo.tsx
git commit -m "feat(landing): ScrollDrivenDemo 확대·클릭스크롤 연동 프레임 추가"
```

---

### Task 7: 구매사 랜딩 배선 (`LandingHero.tsx`)

Problem·Solution·Demo 세 섹션을 새 컴포넌트로 배선. 눈으로 튜닝.

**Files:**
- Modify: `components/landing/LandingHero.tsx`

**Interfaces:**
- Consumes: `ScrollDrivenProblem` (Task 5), `ScrollPinnedSection` (Task 2), controlled `SolutionShowcase` (Task 3), `ScrollDrivenDemo` (Task 6), `DemoAppShell` (Task 4).

- [ ] **Step 1: import 추가**

`components/landing/LandingHero.tsx` 상단 import 블록에 추가:

```tsx
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';
import { ScrollDrivenProblem } from '@/components/landing/scroll-pinned/ScrollDrivenProblem';
import { ScrollDrivenDemo } from '@/components/landing/scroll-pinned/ScrollDrivenDemo';
```

- [ ] **Step 2: Problem 섹션 교체 (`:66-80` 블록)**

기존 `{/* ── Problem ── */}` `<section>` 내부를 교체:

```tsx
        {/* ── Problem (pin: 누적 등장) ── */}
        <section className={sectionCls}>
          <ScrollDrivenProblem
            heading={
              <SectionHeading>
                기존 PG 계약을 하면서<br />이런 불편함을 겪지 않으셨나요?
              </SectionHeading>
            }
            items={PROBLEM_ITEMS}
            stagger={0.08}
          />
        </section>
```

- [ ] **Step 3: Solution 섹션 교체 (`:83-90` 블록)**

```tsx
        {/* ── Solution (pin: 스크롤 구동 강조, 타이머 없음) ── */}
        <section id="service" className={sectionCls}>
          <ScrollPinnedSection steps={SOLUTION_POINTS.length}>
            {({ pinned, activeStep }) => (
              <div className={containerCls}>
                <SectionHeading>
                  SupporterB를 통해<br />PG 도입 문제를 해결해보세요
                </SectionHeading>
                <SolutionShowcase
                  points={SOLUTION_POINTS}
                  activeStep={pinned ? activeStep : null}
                />
              </div>
            )}
          </ScrollPinnedSection>
        </section>
```

- [ ] **Step 4: Demo 섹션 교체 (`:92-103` 블록의 `<DemoAppShell />` 부분)**

`{/* ── Process ── */}` 섹션에서 `<DemoAppShell />` 한 줄을 교체(헤딩·설명 문단은 유지):

```tsx
            <ScrollDrivenDemo renderDemo={(p) => <DemoAppShell {...p} />} />
```

- [ ] **Step 5: 타입·린트 + 관련 유닛 확인**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test components/landing/LandingHero.test.tsx`
Expected: 0 에러 / PASS. (`LandingHero.test`는 `SolutionShowcase`를 `() => null`로 목킹하므로 영향 없음. `DemoAppShell`은 실제 렌더될 수 있으니 실패 시 목 상태 확인.)

- [ ] **Step 6: 브라우저 육안 확인 (데스크톱)**

`pnpm dev` 후 구매사 랜딩(로컬 `lvh.me:3000`)에서:
- Problem: 스크롤 시 카드 1→4 누적 등장, 끝나면 4개 모두 표시.
- Solution: 스크롤 시 포인트 강조가 0→3 이동, 비교표 하이라이트 동기.
- Demo: pin 상태로 스크롤 시 페이지 1→4 전환 + 목업 살짝 확대, 사이드바/목록/StepBar 클릭 시 해당 스텝으로 부드럽게 스크롤(클릭·스크롤 일치).
- `stepVh`(기본 80)가 너무 길면 `ScrollPinnedSection` 사용부에 `stepVh={60}` 등으로 조정. 연속 3 pin 흐름 확인.

- [ ] **Step 7: 커밋**

```bash
git add components/landing/LandingHero.tsx
git commit -m "feat(landing): 구매사 랜딩 Problem·Solution·Demo 스크롤 pin 배선"
```

---

### Task 8: PG 랜딩 배선 (`PgLanding.tsx`)

Problem·Demo 두 섹션 배선(Solution 없음). 구매사에서 검증한 컴포넌트 재사용.

**Files:**
- Modify: `components/landing/PgLanding.tsx`

**Interfaces:**
- Consumes: `ScrollDrivenProblem` (Task 5), `ScrollDrivenDemo` (Task 6), `PgDemoAppShell` (Task 4).

- [ ] **Step 1: import 추가**

```tsx
import { ScrollDrivenProblem } from '@/components/landing/scroll-pinned/ScrollDrivenProblem';
import { ScrollDrivenDemo } from '@/components/landing/scroll-pinned/ScrollDrivenDemo';
```

- [ ] **Step 2: Problem 섹션 교체 (`id="problem"` 섹션, `:192-215` 블록)**

헤딩 + 서브문단(intro) + 4카드를 `ScrollDrivenProblem`으로. (기존 헤딩/문단 문구·`subCls` 그대로 사용)

```tsx
        {/* ── 화면2: Problem (pin: 누적 등장) ── */}
        <section id="problem" className={sectionCls}>
          <ScrollDrivenProblem
            heading={
              <SectionHeading>
                PG 영업에서 가장 어려운 건<br />
                리드 수가 아니라, 확실한 니즈입니다
              </SectionHeading>
            }
            intro={
              <FadeInView>
                <p className={subCls}>
                  고객사를 아무리 많이 만나도, 실제로 PG를 바꾸거나 새로 도입하려는 곳은 많지
                  않습니다. 의사가 불분명한 리드에 제안서와 미팅이 쌓일수록, 정작 수주로 이어지는
                  기회는 줄어듭니다.
                </p>
              </FadeInView>
            }
            items={PROBLEM_ITEMS}
            stagger={0.06}
          />
        </section>
```

- [ ] **Step 3: Demo 섹션 교체 (`id="process"` 섹션의 `<PgDemoAppShell />`, `:309`)**

`<PgDemoAppShell />` 한 줄을 교체(헤딩·`PgProcessSteps` 등 나머지 유지):

```tsx
            <ScrollDrivenDemo renderDemo={(p) => <PgDemoAppShell {...p} />} />
```

- [ ] **Step 4: 타입·린트 + PG 유닛 확인**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test components/landing/__tests__/PgLanding.test.tsx components/landing/__tests__/PgLandingNav.test.tsx`
Expected: 0 에러 / PASS. (`PgLanding.test`는 motion을 목킹·구조만 검증 → 폴백 경로로 통과.)

- [ ] **Step 5: 브라우저 육안 확인 (데스크톱 + 모바일 폴백)**

`partner.lvh.me:3000`에서:
- Problem: 헤딩·문단 고정 + 카드 누적 등장.
- Demo: pin 스크롤 전환 + 확대 + 클릭·스크롤 연동.
- 모바일 폭(`<lg`, DevTools 반응형): pin 없이 오늘 모습(문제=FadeInView 스택, 데모=자동재생+클릭).
- OS reduced-motion on: 데스크톱에서도 pin off, 폴백.

- [ ] **Step 6: 커밋**

```bash
git add components/landing/PgLanding.tsx
git commit -m "feat(landing): PG 랜딩 Problem·Demo 스크롤 pin 배선"
```

---

### Task 9: 최종 검증 + QA 체크리스트

**Files:** (없음 — 검증·튜닝만)

- [ ] **Step 1: 전체 헬스 스택**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: tsc 0, lint 0, 유닛 스위트 전부 green. (jsdom 환경 기존 대량-실패가 있으면 메모리 `jsdom-localstorage-mass-fail` 참고 — 내 변경과 무관한 선존재 실패는 단독 파일 green으로 판별.)

- [ ] **Step 2: 데스크톱 QA (양 랜딩)**

각 랜딩에서 확인:
- Problem 누적 등장(1→4), 끝 상태 = 4개 표시.
- (구매사) Solution 강조·표 동기, 타이머 자동 순환 없음(가만히 두면 안 움직임, 스크롤해야 움직임).
- Demo pin 스크롤 전환 + 0.95→1.0 확대 + 클릭=해당 스텝 스크롤(사이드바 항목·목록 행·하단 StepBar).
- 연속 pin 흐름이 과하지 않은지(필요 시 `stepVh` 튜닝).

- [ ] **Step 3: 폴백 QA**

- 모바일 폭(`<lg`): 세 섹션 모두 오늘 모습.
- reduced-motion on: pin·smooth-scroll off, 폴백. Solution은 평평.

- [ ] **Step 4: `/design-review` (Linear 정합)**

Run: `/design-review` — pin 섹션들이 Linear 밀도·모션 절제(transform/opacity, 저대비 보더)와 어긋나지 않는지 점검, 지적 사항 반영.

- [ ] **Step 5: 최종 커밋(튜닝 반영 시)**

```bash
git add -A
git commit -m "polish(landing): 스크롤 pin 섹션 튜닝(stepVh·확대·흐름)"
```

---

## Self-Review

**1. Spec coverage:**
- 공용 `ScrollPinnedSection`(폴백·하이드레이션 가드·scrollToStep) → Task 2 ✓
- Problem 누적 등장(양 랜딩) → Task 5 + 배선 Task 7·8 ✓
- Solution 타이머 제거·스크롤 구동·표 연동(구매사) → Task 3 + 배선 Task 7 ✓
- Demo 클릭·스크롤 단일 타임라인 + 0.95→1.0 확대 + 내부 스크롤 잠금(양 랜딩) → Task 4·6 + 배선 Task 7·8 ✓
- reduced-motion·모바일 폴백 = 오늘 경로 재사용 → 각 컴포넌트에 반영 ✓
- 공용 ease 추출(선택) → Task 1 ✓
- 테스트 방침(SolutionShowcase 재작성, 기본 동작 불변) → Task 3·4·9 ✓
- 구매사 먼저 → PG 복제 → Task 7 후 Task 8 ✓

**2. Placeholder scan:** "TBD/TODO/적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함. 튜닝 노브(`stepVh`·확대·flow)는 스펙이 명시한 "눈으로 결정" 항목이라 값(기본 80·0.95→1.0)을 제시함. ✓

**3. Type consistency:**
- `PinnedState` 필드명(`pinned`·`activeStep`·`progress`·`scrollToStep`)이 Task 2 정의 ↔ Task 5·6·7 사용 일치. ✓
- `DemoControlProps`(`controlledStep`·`onStepSelect`·`scrollLocked`)가 Task 4(셸) ↔ Task 6(`ScrollDrivenDemo`) ↔ Task 7·8(배선) 일치. ✓
- `ScrollDrivenProblem` props(`heading`·`intro?`·`items`·`stagger?`)가 Task 5 정의 ↔ Task 7·8 사용 일치. ✓
- `SolutionShowcase`(`points`·`activeStep?`)가 Task 3 정의 ↔ Task 7 사용 일치. ✓
- `controlledStep`는 1-based(페이지), `ScrollPinnedSection.activeStep`은 0-based → Task 6에서 `step + 1`/`n - 1`로 변환(일관). ✓
