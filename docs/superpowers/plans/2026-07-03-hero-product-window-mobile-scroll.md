# Hero Product Window 모바일 표 스크롤 활성화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜딩 히어로의 장식용 제품 창(`HeroProductWindow`) 안 견적 비교표가 모바일 폭에서 오른쪽 열이 영구히 안 보이던 문제를, 이미 구현된 스크롤+페이드 메커니즘(`OfferComparisonTable`의 `showScrollFade`)을 실제로 켜서 해결한다.

**Architecture:** `HeroProductWindow.tsx` 한 파일만 수정한다. `OfferComparisonTable`을 감쌌던 `overflow-x-clip` 오버라이드를 제거하고 `showScrollFade`를 기본값(`true`)으로 되돌린 뒤, 표에만 국소적으로 `pointer-events-auto`를 걸어 창 전체의 `pointer-events-none`(장식 의도) 아래에서도 표만 실제로 드래그 스크롤 가능하게 만든다. `OfferComparisonTable.tsx`, `SolutionShowcase.tsx`는 무변경.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4 (CSS 변수 기반 토큰), Vitest.

## Global Constraints

- 변경 파일은 `components/landing/hero/HeroProductWindow.tsx` 하나뿐 — `OfferComparisonTable.tsx`, `SolutionShowcase.tsx`는 손대지 않는다.
- `aria-hidden`, 창 전체의 `pointer-events-none`은 유지한다(장식 의도 보존) — 표에만 국소적으로 `pointer-events-auto`를 건다.
- 이 변경은 시각/CSS 클래스 조정 + 기존 prop 기본값 복원이며 신규 state·핸들러·조건 분기를 추가하지 않는다 → `CLAUDE.md`의 TDD 면제("시각/스타일만 손대는 변경") 대상이며, 사용자가 랜딩 작업 전반에 대해 TDD를 면제한다고 이미 확인함. 실패하는 테스트를 먼저 작성하지 않는다.
- 검증은 `pnpm tsc --noEmit` + `pnpm lint` + 기존 `OfferComparisonTable.test.tsx` green 유지 + 브라우저 모바일 뷰포트 육안 확인으로 한다(자동 회귀 테스트 신규 작성 없음 — 스펙에 명시된 방침).
- 스펙 원문: `docs/superpowers/specs/2026-07-03-hero-product-window-mobile-scroll-design.md`

---

## File Structure

- **Modify: `components/landing/hero/HeroProductWindow.tsx`**
  - 콘텐츠 래퍼 `div`(현재 27행)에서 `[&_.overflow-x-auto]:overflow-x-clip` 클래스 제거, 관련 주석(26행) 갱신.
  - `<OfferComparisonTable showScrollFade={false} />`를 `<OfferComparisonTable />`로 변경(기본값 `true` 사용).
  - `<OfferComparisonTable />`을 `pointer-events-auto` 클래스를 가진 `div`로 감싼다(표만 인터랙션 가능하게, 창의 나머지 부분은 계속 `pointer-events-none`).
  - 파일 상단 주석(7행)에 "표는 예외적으로 스크롤 가능"이라는 취지를 한 줄 보강.

- **변경 없음: `components/landing/OfferComparisonTable.tsx`** — 기존 `showScrollFade` prop을 그대로 소비.
- **변경 없음: `components/landing/SolutionShowcase.tsx`, `components/landing/hero/HeroPinnedScene.tsx`**

---

### Task 1: HeroProductWindow에서 표 스크롤 활성화

**Files:**
- Modify: `components/landing/hero/HeroProductWindow.tsx` (전체, 39줄짜리 파일)
- Test: 없음 (TDD 면제 대상 — Global Constraints 참조). 검증은 Task 2에서 tsc/lint/기존 테스트로, Task 3에서 브라우저 육안 확인으로 수행한다.

**Interfaces:**
- Consumes: `OfferComparisonTable`(from `@/components/landing/OfferComparisonTable`) — `showScrollFade?: boolean`(기본 `true`) prop을 그대로 사용. 새 prop 추가 없음.
- Produces: `HeroProductWindow()` 컴포넌트 자체(export 시그니처 무변경, 인자 없음) — `HeroPinnedScene.tsx:146`의 `<HeroProductWindow />` 호출부는 무변경.

- [ ] **Step 1: 파일 전체를 다음 내용으로 교체한다**

```tsx
import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';
import { Chip } from '@/components/primitives/Chip';

// 히어로 '제품 창' — 다크 오프닝 씬에서 스크롤과 함께 떠오르는 라이트 앱 창 목업.
// 실데모(DemoAppShell) 임베드 금지: 데모 fixtures가 모듈 스코프 Date.now()를 쓰는
// hydration mismatch 지뢰(기지 버그)가 있다. 이 창의 내용물은 전부 결정적 리터럴이어야 한다.
// 장식용 비주얼이므로 인터랙션·접근성 트리에서 제외한다(pointer-events-none + aria-hidden).
// 단, 비교표는 모바일 폭에서 7열이 다 안 들어가므로 예외적으로 가로 스크롤만 허용한다
// (표 wrapper에 pointer-events-auto, OfferComparisonTable은 기본 showScrollFade=true 사용).
export function HeroProductWindow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex h-full w-full select-none flex-col overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-4)]"
    >
      {/* 창 크롬 — 데모 창(demo-app-window)과 같은 계열의 미니 탑바 */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)]">
          견적 비교 <span className="md-numeric">P-2042-0042</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-[var(--s-4)] overflow-hidden p-5 md:p-6">
        <div className="flex items-center gap-[var(--s-3)]">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
            받은 견적
          </span>
          <Chip label="입찰 3건 도착" color="primary" />
        </div>
        {/* 표만 예외적으로 인터랙션 허용 — 모바일 폭에서 가로 드래그로 나머지 열을 볼 수 있다 */}
        <div className="pointer-events-auto">
          <OfferComparisonTable />
        </div>
      </div>
    </div>
  );
}
```

  변경 요약: (a) 26행의 `overflow-x-clip` 주석·클래스 제거, (b) `OfferComparisonTable`을 `pointer-events-auto` div로 감싸고 `showScrollFade={false}` prop 제거(기본값 `true` 사용), (c) 파일 상단 주석에 표 스크롤 예외 한 줄 추가.

- [ ] **Step 2: 커밋**

```bash
git add components/landing/hero/HeroProductWindow.tsx
git commit -m "fix(landing): 히어로 제품 창 견적 비교표 모바일 가로 스크롤 활성화"
```

---

### Task 2: 정적 검증 (tsc / lint / 기존 테스트)

**Files:** 없음(검증 전용 태스크, 파일 변경 없음)

**Interfaces:** 없음

- [ ] **Step 1: 타입체크**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음(0 errors). `HeroProductWindow.tsx`는 prop 제거·클래스 문자열 변경뿐이라 타입 영향 없어야 한다.

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: `components/landing/hero/HeroProductWindow.tsx`에 대해 에러 없음.

- [ ] **Step 3: OfferComparisonTable 기존 테스트 green 확인**

Run: `pnpm test components/landing/__tests__/OfferComparisonTable.test.tsx`
Expected: 전부 PASS (이 파일은 무변경이므로 회귀 없어야 한다 — `showScrollFade={false}` 케이스를 검증하는 테스트가 있다면, 그건 `<OfferComparisonTable showScrollFade={false} />` 직접 호출을 테스트하는 것이라 `HeroProductWindow`가 이제 그 prop을 안 쓰는 것과는 무관하게 계속 PASS해야 한다).

- [ ] **Step 4: 셋 다 통과하면 진행. 실패 시 Task 1로 돌아가 수정 후 재실행.**

---

### Task 3: 브라우저 육안 확인 (모바일 뷰포트)

**Files:** 없음

**Interfaces:** 없음

CLAUDE.md 방침("UI 변경은 실제 브라우저에서 확인")에 따라 자동 테스트만으로 종료하지 않는다.

- [ ] **Step 1: 개발 서버 기동**

Run: `pnpm dev`
Expected: `http://localhost:3000`에서 서버가 뜬다.

- [ ] **Step 2: 브라우저(또는 claude-in-chrome)로 랜딩 홈(`/`) 접속 후 뷰포트를 375×812(iPhone 표준) 정도로 좁힌다**

확인 항목:
- 히어로 스크롤을 진행시켜 제품 창이 떠오른 상태에서, 비교표가 PG사·수수료·정산주기 정도까지 기본으로 보이는지
- 표 오른쪽에 페이드+화살표 힌트(`offer-table-scroll-fade`)가 보이는지
- 표를 좌우로 드래그하면 보증보험·가입비·승인 상태·협의 가능 여부 열이 스크롤되어 드러나는지
- 표를 드래그하는 동안 페이지의 세로 스크롤(히어로 핀 애니메이션)이 오작동하지 않는지

- [ ] **Step 3: 뷰포트를 데스크톱 폭(1440px 등)으로 되돌려 기존 룩(전체 7열이 스크롤 없이 다 보이던 모습)이 그대로인지 확인**

- [ ] **Step 4: 문제 없으면 완료. 문제 발견 시 Task 1 코드를 수정하고 Task 2부터 재실행.**

---

## Self-Review 메모

- **스펙 커버리지**: 스펙의 "변경 범위" 4개 항목(clip 해제·showScrollFade 켜기·pointer-events-auto 국소 적용·aria-hidden 유지) 모두 Task 1에 반영됨. "검토한 리스크"(제스처 충돌 낮음, 320px 대 빠듯함 감수)는 Task 3의 육안 확인 체크리스트로 커버됨. "테스트 방침"(TDD 면제, tsc/lint/기존 테스트+육안)은 Global Constraints + Task 2/3에 반영됨.
- **플레이스홀더 스캔**: 없음 — 모든 코드 스텝에 실제 최종 파일 전문이 포함됨.
- **타입/시그니처 일관성**: `HeroProductWindow()` 시그니처 무변경(인자 없음, named export) — `HeroPinnedScene.tsx`의 호출부와 어긋나지 않음. `OfferComparisonTable` 호출은 prop 없이(`<OfferComparisonTable />`) 기본값 사용 — 컴포넌트 정의(`showScrollFade = true`)와 일치.
