# SavingsCalculator UI 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜딩 절감액 계산기(`SavingsCalculator`)를 입력 사이드바+출력 패널 구조의 통합 카드로 재편하고, 결과 강조·등급 툴팁·숫자 트윈 애니메이션·드래그 값 버블을 더해 신뢰감/완성도를 높인다.

**Architecture:** `lib/landing/savings.ts`에 등급 구간 설명 헬퍼를 추가하고, 신규 `lib/landing/use-animated-number.ts` rAF 보간 훅을 만든 뒤, `SavingsCalculator.tsx`를 4단계(구조 재편 → 결과 강조 → 등급 툴팁 → 드래그 값 버블)로 점진 수정한다. `CostComparisonChart.tsx`는 기존 자체 마크업이 이미 패딩 없는 컨테이너라 변경이 필요 없다(부모의 `border-t`/`padding` 래퍼만 옮겨 붙이면 됨).

**Tech Stack:** React 19 + Next.js App Router, TypeScript strict, Tailwind v4 CSS 변수 토큰, `@base-ui/react` Tooltip, Radix Slider, `motion/react`(useInView만), Vitest + Testing Library.

**Design doc:** `docs/superpowers/specs/2026-07-02-savings-calculator-ui-design.md`

## Global Constraints

- Linear 디자인 하드룰 준수(`DESIGN.md`) — 무거운 그림자·그라데이션·글래스모피즘 금지, interactive 요소는 6px(`shape-small`), 저대비 보더(`outline-variant`) 우선.
- **TDD Iron Law 예외 적용** — 이 작업은 랜딩 전용 작업에 대해 이미 확립된 관례(설계 문서 "테스트 전략" 절)에 따라 RED-first를 강제하지 않는다. 각 태스크는 "구현 → 테스트 갱신/추가 → `pnpm test <path>` 통과 확인 → `pnpm tsc --noEmit` → `pnpm lint` → 커밋" 순서로 진행한다.
- 공유 컴포넌트는 **읽기만 하고 수정하지 않는다**: `components/ui/slider.tsx`, `components/ui/tooltip.tsx`, `components/primitives/KpiCell.tsx`, `components/primitives/Chip.tsx`.
- 절감액은 항상 양수(0원이 될 수 없음)라는 기존 불변식을 유지한다 — `rateFloorBp`/`minCurrentRate`/`annualMaxSavings`의 계산 로직 자체는 변경하지 않는다(등급 판정 결과가 동일하게 유지되는 내부 리팩터만 허용).
- 패키지 매니저는 pnpm.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `lib/landing/savings.ts` | 수정 | 등급 임계값을 단일 배열로 추출, `tierRangeLabel()` 추가(기존 계산 함수 동작 불변) |
| `lib/landing/__tests__/savings.test.ts` | 수정 | `tierRangeLabel` 테스트 추가 |
| `lib/landing/use-animated-number.ts` | 신규 | rAF 기반 숫자 보간 훅 |
| `lib/landing/__tests__/use-animated-number.test.ts` | 신규 | 훅 단위 테스트 |
| `components/landing/SavingsCalculator.tsx` | 수정 | 구조 재편, 결과 강조, 등급 툴팁, 드래그 값 버블 (Task 3~6에 걸쳐 점진 수정) |
| `components/landing/__tests__/SavingsCalculator.test.tsx` | 수정 | 등급 툴팁·드래그 버블 테스트 추가 |
| `components/landing/CostComparisonChart.tsx` | 변경 없음 | 이미 패딩 없는 자체 완결 마크업이라 그대로 재사용 |

---

### Task 1: `lib/landing/savings.ts` — 등급 구간 설명 헬퍼

**Files:**
- Modify: `lib/landing/savings.ts`
- Test: `lib/landing/__tests__/savings.test.ts`

**Interfaces:**
- Consumes: 없음(순수 리팩터 + 추가)
- Produces: `export function tierRangeLabel(tier: MerchantTier): string` — Task 5(`SavingsCalculator.tsx`의 등급 툴팁)가 그대로 가져다 쓴다. `gradeFromVolume`/`minCurrentRate`/`annualMaxSavings`의 시그니처와 반환값은 기존과 동일하게 유지된다.

- [ ] **Step 1: 등급 임계값을 단일 배열로 추출하고 `tierRangeLabel`을 추가한다**

`lib/landing/savings.ts` 전체를 다음으로 교체한다:

```ts
import type { MerchantTier } from '@/lib/types/bid';

export const GENERAL_ASSUMED_RATE = 0.015;

// 절감 시뮬레이터용 등급별 달성 가능 카드 요율(추정 기준선). 마케팅 계산 전용으로
// 제품의 협상 입력값과는 무관하다.
export const SUPPORTER_B_RATE: Record<MerchantTier, number> = {
  sole: 0.005,
  sme1: 0.011,
  sme2: 0.0125,
  sme3: 0.015,
  general: GENERAL_ASSUMED_RATE,
};

// 등급 구간(연 거래액 상한, KRW). gradeFromVolume·tierRangeLabel의 단일 출처 —
// 여기 값을 바꾸면 등급 판정과 계산기 툴팁 표기가 함께 갱신된다.
const TIER_UPPER_BOUNDS: Array<{ tier: MerchantTier; maxKRW: number }> = [
  { tier: 'sole', maxKRW: 3e8 },
  { tier: 'sme1', maxKRW: 5e8 },
  { tier: 'sme2', maxKRW: 1e9 },
  { tier: 'sme3', maxKRW: 3e9 },
];

export function gradeFromVolume(annualKRW: number): MerchantTier {
  const found = TIER_UPPER_BOUNDS.find(({ maxKRW }) => annualKRW <= maxKRW);
  return found ? found.tier : 'general';
}

function eokLabel(krw: number): string {
  return `${Math.round(krw / 1e8).toLocaleString('ko-KR')}억`;
}

// 계산기 "가맹점 등급" 옆 툴팁에 쓰는, 사람이 읽는 구간 설명.
export function tierRangeLabel(tier: MerchantTier): string {
  const idx = TIER_UPPER_BOUNDS.findIndex((t) => t.tier === tier);
  if (idx === -1) {
    const prevMax = TIER_UPPER_BOUNDS[TIER_UPPER_BOUNDS.length - 1].maxKRW;
    return `연 거래액 ${eokLabel(prevMax)} 초과`;
  }
  const { maxKRW } = TIER_UPPER_BOUNDS[idx];
  const prevMax = idx > 0 ? TIER_UPPER_BOUNDS[idx - 1].maxKRW : 0;
  return prevMax === 0
    ? `연 거래액 ${eokLabel(maxKRW)} 이하`
    : `연 거래액 ${eokLabel(prevMax)} 초과 ${eokLabel(maxKRW)} 이하`;
}

// 현재 수수료율 슬라이더의 하한. 우리가 가정하는 달성 요율보다 항상 이 마진만큼 위에
// 두어, 어떤 거래액·요율 조합에서도 예상 절감액이 0원이 되지 않게 한다.
export const RATE_FLOOR_MARGIN = 0.001;

export function minCurrentRate(volume: number): number {
  return SUPPORTER_B_RATE[gradeFromVolume(volume)] + RATE_FLOOR_MARGIN;
}

export function annualMaxSavings(volume: number, currentRate: number): number {
  const after = SUPPORTER_B_RATE[gradeFromVolume(volume)];
  const diff = Math.max(0, currentRate - after);
  return Math.round(diff * volume);
}
```

- [ ] **Step 2: `tierRangeLabel` 테스트를 추가한다**

`lib/landing/__tests__/savings.test.ts`의 import 줄을 다음으로 바꾸고:

```ts
import { describe, it, expect } from 'vitest';
import {
  SUPPORTER_B_RATE,
  RATE_FLOOR_MARGIN,
  annualMaxSavings,
  gradeFromVolume,
  minCurrentRate,
  tierRangeLabel,
} from '../savings';
```

파일 끝에 다음 블록을 추가한다:

```ts
describe('tierRangeLabel', () => {
  it('describes each tier boundary in human-readable 억 units', () => {
    expect(tierRangeLabel('sole')).toBe('연 거래액 3억 이하');
    expect(tierRangeLabel('sme1')).toBe('연 거래액 3억 초과 5억 이하');
    expect(tierRangeLabel('sme2')).toBe('연 거래액 5억 초과 10억 이하');
    expect(tierRangeLabel('sme3')).toBe('연 거래액 10억 초과 30억 이하');
    expect(tierRangeLabel('general')).toBe('연 거래액 30억 초과');
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `pnpm test lib/landing/__tests__/savings.test.ts`
Expected: 기존 `minCurrentRate` 테스트 2개 + 신규 `tierRangeLabel` 테스트 1개 모두 PASS.

- [ ] **Step 4: 타입/린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add lib/landing/savings.ts lib/landing/__tests__/savings.test.ts
git commit -m "feat(landing): add tierRangeLabel for calculator grade tooltip"
```

---

### Task 2: `lib/landing/use-animated-number.ts` — 숫자 트윈 보간 훅

**Files:**
- Create: `lib/landing/use-animated-number.ts`
- Test: `lib/landing/__tests__/use-animated-number.test.ts`

**Interfaces:**
- Consumes: `prefersReducedMotion()` from `@/lib/landing/prefers-reduced-motion` (기존 함수, 시그니처 불변)
- Produces: `export function useAnimatedNumber(target: number, durationMs?: number): number` — Task 4(`SavingsCalculator.tsx`의 절감액 숫자)가 `useAnimatedNumber(savings)` 형태로 그대로 가져다 쓴다. 반환값은 매 렌더마다 보간된 현재 표시 숫자(number)다.

- [ ] **Step 1: 훅 구현**

`lib/landing/use-animated-number.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

const DEFAULT_DURATION_MS = 220;

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

// 값이 바뀔 때마다 표시 숫자를 이전 값에서 새 목표로 부드럽게 보간한다. 목표가
// 애니메이션 도중에 다시 바뀌어도(예: 슬라이더를 계속 드래그) "현재 표시값 → 새 목표"로
// 이어서 재시작하므로 끊기지 않는다. 마운트 시점에는 목표값을 즉시 반환한다(0에서부터
// 차오르지 않음) — 이 훅은 "값 변화"를 부드럽게 만드는 용도지, 진입 연출용이 아니다.
export function useAnimatedNumber(target: number, durationMs: number = DEFAULT_DURATION_MS): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    const to = target;
    if (from === to) return;

    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / durationMs);
      const value = from + (to - from) * easeOutCubic(p);
      displayRef.current = value;
      setDisplay(value);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}
```

- [ ] **Step 2: 훅 테스트 작성**

`lib/landing/__tests__/use-animated-number.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useAnimatedNumber } from '../use-animated-number';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe('useAnimatedNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance'],
    });
    stubMatchMedia(false); // non-reduced-motion by default
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error remove the test stub
    delete window.matchMedia;
  });

  it('returns the initial target immediately on mount, with no animation', () => {
    const { result } = renderHook(() => useAnimatedNumber(100));
    expect(result.current).toBe(100);
  });

  it('animates from the previous value toward a new target over the given duration', () => {
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target, 200), {
      initialProps: { target: 0 },
    });
    rerender({ target: 100 });

    act(() => {
      vi.advanceTimersByTime(100); // halfway through the 200ms duration
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);

    act(() => {
      vi.advanceTimersByTime(200); // past the end
    });
    expect(result.current).toBe(100);
  });

  it('restarts from the current displayed value when the target changes mid-flight', () => {
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target, 200), {
      initialProps: { target: 0 },
    });
    rerender({ target: 100 });
    act(() => {
      vi.advanceTimersByTime(100); // halfway to 100
    });
    const midValue = result.current;

    rerender({ target: 50 }); // change target before the first animation finishes
    act(() => {
      vi.advanceTimersByTime(1); // first tick after the new target
    });
    // it should continue from roughly where it was, not jump back to 0 or to the old target of 100
    expect(result.current).toBeLessThanOrEqual(midValue + 1);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(50);
  });

  it('shows the new target immediately when reduced motion is preferred', () => {
    stubMatchMedia(true);
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target, 200), {
      initialProps: { target: 0 },
    });
    rerender({ target: 100 });
    expect(result.current).toBe(100);
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `pnpm test lib/landing/__tests__/use-animated-number.test.ts`
Expected: 4개 테스트 모두 PASS.

- [ ] **Step 4: 타입/린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add lib/landing/use-animated-number.ts lib/landing/__tests__/use-animated-number.test.ts
git commit -m "feat(landing): add useAnimatedNumber tween hook"
```

---

### Task 3: `SavingsCalculator.tsx` — 사이드바/출력 패널 구조로 재편

**Files:**
- Modify: `components/landing/SavingsCalculator.tsx`
- Test: `components/landing/__tests__/SavingsCalculator.test.tsx` (변경 없이 재실행만 — 구조만 바뀌고 텍스트/DOM 순서는 보존됨)

**Interfaces:**
- Consumes: 기존 `CostComparisonChart`, `Slider`, `Chip`, `formatKRW`, `MERCHANT_TIER_LABELS`, `lib/landing/savings.ts`의 계산 함수(모두 시그니처 불변)
- Produces: 이 태스크 이후 컴포넌트 루트는 `rounded-lg border` 통합 카드 + `grid-cols-[260px_1fr]` 구조. Task 4/5/6이 이 구조 위에서 사이드바 하단(등급 Chip 자리)과 출력 패널 상단(결과 숫자 자리)을 각각 교체한다. `Chip`+가맹점 등급 블록은 사이드바 마지막 자식(`mt-auto`)에 위치 — Task 5가 여기에 툴팁을 덧붙인다.

- [ ] **Step 1: 루트 구조를 사이드바+출력 패널 그리드로 재작성한다**

`import { KpiCell } from '@/components/primitives/KpiCell';`는 이 스텝에서 그대로 둔다 — 이번 스텝은 레이아웃 구조만 바꾸고, `KpiCell` 자체를 교체하는 건 Task 4에서 한다.

`return (` 이후 전체(파일 151~264행, `<section ref={rootRef} ...>`부터 닫는 `</section>`까지)를 다음으로 교체한다:

```tsx
  return (
    <section
      ref={rootRef}
      className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-[var(--s-8)]"
    >
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-[var(--s-8)] md:gap-0">
        {/* Sidebar — inputs */}
        <div className="flex flex-col gap-[var(--s-8)] md:border-r md:border-[var(--md-sys-color-outline-variant)] md:pr-[var(--s-8)]">
          <div className="flex flex-col gap-[var(--s-3)]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[var(--text-xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">연간 거래액</span>
              <span className="font-mono tabular-nums text-[var(--text-base)] text-[var(--md-sys-color-on-surface)] tracking-[0.02em]">
                {formatVolume(volume)}
              </span>
            </div>
            <div className="relative">
              <Slider
                value={volT}
                min={0}
                max={VOL_T_MAX}
                step={1}
                onValueChange={(v) => {
                  resetIdleRef.current?.();
                  setVolT(v);
                  // 거래액이 상위 등급으로 올라가 하한이 현재 요율을 넘어서면 핸들을 끌어올린다.
                  const floor = rateFloorBp(tToVolume(v));
                  setRateBp((r) => Math.max(r, floor));
                }}
                ariaLabel="연간 거래액"
              />
              {hintActive && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 z-10"
                  style={{ left: `${cursorPct}%` }}
                >
                  <div className="-translate-x-1 -translate-y-1 flex flex-col items-start">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="var(--md-sys-color-on-surface)"
                      stroke="var(--md-sys-color-surface)"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    >
                      <path d="M5 2.5l13.5 7.8-5.9 1.5-1.5 5.9z" />
                    </svg>
                    <span className="ml-3 -mt-1 whitespace-nowrap rounded-md bg-[var(--md-sys-color-on-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-2)]">
                      드래그해서 조정해 보세요
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between font-mono text-[var(--text-2xs)] tracking-[0.1em] text-[var(--md-sys-color-outline)] uppercase">
              <span>1 억</span>
              <span>1,000 억</span>
            </div>
          </div>

          <div className="flex flex-col gap-[var(--s-3)]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[var(--text-xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">현재 PG 수수료율</span>
              <span className="font-mono tabular-nums text-[var(--text-base)] text-[var(--md-sys-color-on-surface)] tracking-[0.02em]">
                {formatRate(rateBp / 100)}
              </span>
            </div>
            <div className="relative">
              <Slider
                value={rateBp}
                min={rateMinBp}
                max={RATE_MAX}
                step={RATE_STEP}
                onValueChange={(v) => {
                  resetIdleRef.current?.();
                  setRateBp(Math.max(v, rateMinBp));
                }}
                ariaLabel="현재 PG 수수료율"
              />
            </div>
            <div className="flex justify-between font-mono text-[var(--text-2xs)] tracking-[0.1em] text-[var(--md-sys-color-outline)] uppercase">
              <span>{formatRate(rateMinBp / 100)}</span>
              <span>4.00 %</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-auto pt-[var(--s-2)]">
            <span className="font-mono text-[var(--text-2xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              가맹점 등급
            </span>
            <Chip label={MERCHANT_TIER_LABELS[grade]} color="surface" />
          </div>
        </div>

        {/* Output panel — result + chart */}
        <div className="flex flex-col md:pl-[var(--s-8)]">
          <KpiCell
            label="EST. ANNUAL SAVINGS"
            value={formatKRW(savings)}
          />

          <div className="mt-[var(--s-6)] pt-[var(--s-6)] border-t border-[var(--md-sys-color-outline-variant)]">
            <CostComparisonChart
              currentCost={currentCost}
              supporterBCost={supporterBCost}
            />
          </div>
        </div>
      </div>

      <p className="mt-[var(--s-7)] pt-[var(--s-7)] border-t border-[var(--md-sys-color-outline-variant)] font-mono text-[var(--text-2xs)] tracking-[0.06em] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
        * 예상 절감액은 추정치입니다. 카드 수수료를 포함한 모든 항목(정산주기·보증보험·가입비 등)이
        협상 대상이며, 실제 절감액은 PG사 견적·조건에 따라 달라질 수 있습니다.
      </p>
    </section>
  );
}
```

> 이 스텝에서는 아직 `KpiCell`을 그대로 유지한다 — 이번 스텝의 목적은 오직 레이아웃 구조 변경이다. `KpiCell`을 커스텀 마크업으로 교체하는 건 Task 4에서 한다.

- [ ] **Step 2: 기존 테스트로 회귀 확인**

Run: `pnpm test components/landing/__tests__/SavingsCalculator.test.tsx`
Expected: 기존 10개 테스트 모두 PASS(텍스트 콘텐츠·슬라이더 DOM 순서·idle 힌트 동작이 그대로 보존되므로 수정 없이 통과해야 한다).

- [ ] **Step 3: 타입/린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 4: 로컬 육안 확인**

`pnpm dev` 실행 후 랜딩 페이지 `#calculator` 섹션에서 사이드바(좌)+출력 패널(우) 구조, 데스크톱 세로 구분선, 모바일 1컬럼 스택을 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add components/landing/SavingsCalculator.tsx
git commit -m "refactor(landing): restructure SavingsCalculator into sidebar + output panel"
```

---

### Task 4: `SavingsCalculator.tsx` — 결과 숫자 강조 + 트윈 애니메이션

**Files:**
- Modify: `components/landing/SavingsCalculator.tsx`
- Test: `components/landing/__tests__/SavingsCalculator.test.tsx` (변경 없이 재실행만)

**Interfaces:**
- Consumes: `useAnimatedNumber(target: number, durationMs?: number): number` from `@/lib/landing/use-animated-number` (Task 2)
- Produces: 절감액 숫자가 `tertiary` 색 커스텀 마크업으로 렌더링됨. `KpiCell`은 더 이상 이 파일에서 쓰이지 않는다.

- [ ] **Step 1: import 정리 + `useAnimatedNumber` 적용**

`components/landing/SavingsCalculator.tsx` 상단 import 블록에서 `import { KpiCell } from '@/components/primitives/KpiCell';` 줄을 삭제하고, 다음 import를 추가한다(위치는 `prefersReducedMotion` import 다음 줄):

```ts
import { useAnimatedNumber } from '@/lib/landing/use-animated-number';
```

`const supporterBCost = Math.round(supporterBRate * volume);` 다음 줄에 추가한다:

```ts
  const animatedSavings = useAnimatedNumber(savings);
```

- [ ] **Step 2: 결과 숫자 마크업을 `KpiCell` 대신 커스텀 마크업으로 교체**

Task 3에서 만든 출력 패널의 이 블록:

```tsx
          <KpiCell
            label="EST. ANNUAL SAVINGS"
            value={formatKRW(savings)}
          />
```

을 다음으로 교체한다:

```tsx
          <div className="flex flex-col gap-[var(--s-2)]">
            <span className="font-mono text-[var(--text-xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              EST. ANNUAL SAVINGS
            </span>
            <span className="md-numeric text-[clamp(32px,4vw,40px)] font-semibold leading-none tracking-[-0.02em] text-[var(--md-sys-color-tertiary)]">
              {formatKRW(Math.round(animatedSavings))}
            </span>
          </div>
```

- [ ] **Step 3: 기존 테스트로 회귀 확인**

Run: `pnpm test components/landing/__tests__/SavingsCalculator.test.tsx`
Expected: 모두 PASS. (`getByText('EST. ANNUAL SAVINGS')`, `getByText(/원$/)` 쿼리는 마크업이 바뀌어도 텍스트 콘텐츠가 동일하므로 그대로 통과한다.)

- [ ] **Step 4: 타입/린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 5: 로컬 육안 확인**

`pnpm dev`에서 슬라이더를 드래그하며 절감액 숫자가 초록색(`tertiary`)으로 크게 표시되고, 값이 바뀔 때 부드럽게 이어지는지(끊기지 않는지) 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add components/landing/SavingsCalculator.tsx
git commit -m "feat(landing): emphasize savings figure with tertiary color + tween animation"
```

---

### Task 5: `SavingsCalculator.tsx` — 가맹점 등급 근거 툴팁

**Files:**
- Modify: `components/landing/SavingsCalculator.tsx`
- Test: `components/landing/__tests__/SavingsCalculator.test.tsx`

**Interfaces:**
- Consumes: `tierRangeLabel(tier: MerchantTier): string` from `@/lib/landing/savings` (Task 1), `Tooltip`/`TooltipContent`/`TooltipTrigger`/`TooltipProvider` from `@/components/ui/tooltip`, `InfoIcon` from `@/components/icons`
- Produces: 사이드바 하단 "가맹점 등급" 옆에 info 아이콘 트리거가 추가됨. `aria-label="등급 산정 기준"`로 테스트에서 조회 가능.

- [ ] **Step 1: import 추가**

`components/landing/SavingsCalculator.tsx` 상단에 추가한다:

```ts
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InfoIcon } from '@/components/icons';
```

`import { SUPPORTER_B_RATE, annualMaxSavings, gradeFromVolume, minCurrentRate } from '@/lib/landing/savings';` 를 다음으로 바꾼다:

```ts
import {
  SUPPORTER_B_RATE,
  annualMaxSavings,
  gradeFromVolume,
  minCurrentRate,
  tierRangeLabel,
} from '@/lib/landing/savings';
```

- [ ] **Step 2: 등급 Chip 옆에 info 트리거를 추가한다**

사이드바 하단의 이 블록:

```tsx
          <div className="flex items-center gap-2 mt-auto pt-[var(--s-2)]">
            <span className="font-mono text-[var(--text-2xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              가맹점 등급
            </span>
            <Chip label={MERCHANT_TIER_LABELS[grade]} color="surface" />
          </div>
```

을 다음으로 교체한다:

```tsx
          <div className="flex items-center gap-2 mt-auto pt-[var(--s-2)]">
            <span className="font-mono text-[var(--text-2xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              가맹점 등급
            </span>
            <Chip label={MERCHANT_TIER_LABELS[grade]} color="surface" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      tabIndex={0}
                      aria-label="등급 산정 기준"
                      className="inline-flex items-center text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-help"
                    >
                      <InfoIcon size={14} aria-hidden />
                    </span>
                  }
                />
                <TooltipContent side="top">{tierRangeLabel(grade)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
```

- [ ] **Step 3: 등급 툴팁 트리거 테스트 추가**

`components/landing/__tests__/SavingsCalculator.test.tsx`의 첫 번째 `describe('SavingsCalculator', ...)` 블록 안, 마지막 `it(...)` 다음에 추가한다:

```tsx
  it('shows an info trigger next to the merchant grade explaining the tier boundary', () => {
    render(<SavingsCalculator />);
    expect(screen.getByLabelText('등급 산정 기준')).toBeInTheDocument();
  });
```

- [ ] **Step 4: 테스트 실행**

Run: `pnpm test components/landing/__tests__/SavingsCalculator.test.tsx`
Expected: 신규 테스트 포함 모두 PASS.

- [ ] **Step 5: 타입/린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 6: 로컬 육안 확인**

`pnpm dev`에서 info 아이콘에 마우스를 올려 등급 구간 설명("연 거래액 X억 초과 Y억 이하")이 뜨는지, 거래액 슬라이더를 움직여 등급이 바뀔 때 툴팁 문구도 같이 바뀌는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add components/landing/SavingsCalculator.tsx components/landing/__tests__/SavingsCalculator.test.tsx
git commit -m "feat(landing): add merchant grade tier tooltip to calculator"
```

---

### Task 6: `SavingsCalculator.tsx` — 드래그 중 실시간 값 버블

**Files:**
- Modify: `components/landing/SavingsCalculator.tsx`
- Test: `components/landing/__tests__/SavingsCalculator.test.tsx`

**Interfaces:**
- Consumes: 없음(로컬 state만 추가)
- Produces: 슬라이더를 pointer로 드래그하는 동안 `data-testid="volume-drag-bubble"` / `data-testid="rate-drag-bubble"` 요소가 나타났다 사라진다.

- [ ] **Step 1: 공용 `SliderValueBubble` 컴포넌트를 추출하고 드래그 state를 추가한다**

`components/landing/SavingsCalculator.tsx`의 `export function SavingsCalculator() {` 바로 위에 추가한다:

```tsx
function SliderValueBubble({ pct, text, testId }: { pct: number; text: string; testId?: string }) {
  return (
    <div
      aria-hidden
      data-testid={testId}
      className="pointer-events-none absolute top-1/2 z-10"
      style={{ left: `${pct}%` }}
    >
      <div className="-translate-x-1 -translate-y-1 flex flex-col items-start">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="var(--md-sys-color-on-surface)"
          stroke="var(--md-sys-color-surface)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M5 2.5l13.5 7.8-5.9 1.5-1.5 5.9z" />
        </svg>
        <span className="ml-3 -mt-1 whitespace-nowrap rounded-md bg-[var(--md-sys-color-on-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-2)]">
          {text}
        </span>
      </div>
    </div>
  );
}
```

`export function SavingsCalculator() {` 안, `const interactedRef = useRef(false);` 다음 줄에 추가한다:

```ts
  const [draggingSlider, setDraggingSlider] = useState<'volume' | 'rate' | null>(null);
```

`const cursorPct = (volT / VOL_T_MAX) * 100;` 다음 줄에 추가한다:

```ts
  const rateCursorPct = ((rateBp - rateMinBp) / (RATE_MAX - rateMinBp)) * 100;
```

- [ ] **Step 2: idle 힌트 마크업을 `SliderValueBubble`로 교체하고, 두 슬라이더에 pointer 핸들러 + 드래그 버블을 붙인다**

연간 거래액 슬라이더의 wrapper div(현재 `<div className="relative">`부터 idle 힌트 블록까지)를 다음으로 교체한다:

```tsx
            <div
              className="relative"
              onPointerDown={() => {
                resetIdleRef.current?.();
                setDraggingSlider('volume');
              }}
              onPointerUp={() => setDraggingSlider(null)}
              onPointerCancel={() => setDraggingSlider(null)}
            >
              <Slider
                value={volT}
                min={0}
                max={VOL_T_MAX}
                step={1}
                onValueChange={(v) => {
                  resetIdleRef.current?.();
                  setVolT(v);
                  // 거래액이 상위 등급으로 올라가 하한이 현재 요율을 넘어서면 핸들을 끌어올린다.
                  const floor = rateFloorBp(tToVolume(v));
                  setRateBp((r) => Math.max(r, floor));
                }}
                ariaLabel="연간 거래액"
              />
              {hintActive && <SliderValueBubble pct={cursorPct} text="드래그해서 조정해 보세요" />}
              {draggingSlider === 'volume' && !hintActive && (
                <SliderValueBubble pct={cursorPct} text={formatVolume(volume)} testId="volume-drag-bubble" />
              )}
            </div>
```

현재 PG 수수료율 슬라이더의 wrapper div를 다음으로 교체한다:

```tsx
            <div
              className="relative"
              onPointerDown={() => {
                resetIdleRef.current?.();
                setDraggingSlider('rate');
              }}
              onPointerUp={() => setDraggingSlider(null)}
              onPointerCancel={() => setDraggingSlider(null)}
            >
              <Slider
                value={rateBp}
                min={rateMinBp}
                max={RATE_MAX}
                step={RATE_STEP}
                onValueChange={(v) => {
                  resetIdleRef.current?.();
                  setRateBp(Math.max(v, rateMinBp));
                }}
                ariaLabel="현재 PG 수수료율"
              />
              {draggingSlider === 'rate' && (
                <SliderValueBubble pct={rateCursorPct} text={formatRate(rateBp / 100)} testId="rate-drag-bubble" />
              )}
            </div>
```

- [ ] **Step 3: 드래그 버블 테스트 추가**

`components/landing/__tests__/SavingsCalculator.test.tsx`의 첫 번째 `describe('SavingsCalculator', ...)` 블록 끝에 추가한다:

```tsx
  it('shows a live value bubble while dragging the volume slider, hides it on release', () => {
    render(<SavingsCalculator />);
    const [volumeThumb] = screen.getAllByRole('slider');
    const wrapper = volumeThumb.closest('.relative') as HTMLElement;

    expect(screen.queryByTestId('volume-drag-bubble')).toBeNull();
    fireEvent.pointerDown(wrapper);
    expect(screen.getByTestId('volume-drag-bubble')).toBeInTheDocument();
    fireEvent.pointerUp(wrapper);
    expect(screen.queryByTestId('volume-drag-bubble')).toBeNull();
  });

  it('shows a live value bubble while dragging the rate slider, hides it on pointer cancel', () => {
    render(<SavingsCalculator />);
    const [, rateThumb] = screen.getAllByRole('slider');
    const wrapper = rateThumb.closest('.relative') as HTMLElement;

    expect(screen.queryByTestId('rate-drag-bubble')).toBeNull();
    fireEvent.pointerDown(wrapper);
    expect(screen.getByTestId('rate-drag-bubble')).toBeInTheDocument();
    fireEvent.pointerCancel(wrapper);
    expect(screen.queryByTestId('rate-drag-bubble')).toBeNull();
  });
```

- [ ] **Step 4: 테스트 실행**

Run: `pnpm test components/landing/__tests__/SavingsCalculator.test.tsx`
Expected: 신규 2개 포함 전체 PASS.

- [ ] **Step 5: 타입/린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 6: 로컬 육안 확인**

`pnpm dev`에서 슬라이더를 마우스로 눌러 드래그하는 동안 실시간 값 말풍선이 뜨고, 손을 떼면 사라지는지 확인한다. idle 자동 데모(6초 대기)와 실제 드래그가 서로 간섭하지 않는지도 함께 확인한다.

- [ ] **Step 7: 전체 스위트 + 최종 확인**

Run: `pnpm test && pnpm tsc --noEmit && pnpm lint`
Expected: 전체 그린.

- [ ] **Step 8: 커밋**

```bash
git add components/landing/SavingsCalculator.tsx components/landing/__tests__/SavingsCalculator.test.tsx
git commit -m "feat(landing): show live value bubble while dragging calculator sliders"
```
