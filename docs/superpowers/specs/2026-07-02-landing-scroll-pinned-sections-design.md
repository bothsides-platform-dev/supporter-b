# 랜딩 스크롤 연동 pin 섹션 — 설계

날짜: 2026-07-02
브랜치: `feat/landing-scroll-pin-sections`

## 1. 목표

랜딩 페이지의 특정 섹션에 "스크롤에 반응해 단계가 넘어가는" 느낌을 준다. 섹션을 잠깐
화면에 **고정(pin)** 하고, 스크롤 진행률로 내부 단계를 전진시킨다. 스크롤을 가로채지
않는(native scroll) `position: sticky` + `motion/react`의 `useScroll`/`useTransform`로 구현한다.

## 2. 범위

pin 스크롤-스텝퍼를 적용할 섹션(모두 4스텝):

- **구매사 랜딩(`LandingHero.tsx`)** — 연속 3개
  1. **Problem** — 4개 `ProblemCard`가 **누적 등장**
  2. **Solution** (`SolutionShowcase`, 구매사 전용) — 포인트 강조 + 비교표 연동을
     **스크롤로 구동**, 기존 **타이머 자동 순환 제거**
  3. **Demo** (`DemoAppShell`) — **클릭·스크롤 단일 타임라인** + 목업 0.95→1.0 확대
- **PG 랜딩(`PgLanding.tsx`)** — 2개
  1. **Problem** — 4개 `ProblemCard` 누적 등장
  2. **Demo** (`PgDemoAppShell`) — 구매사 Demo와 동일

순서: **구매사 랜딩을 먼저 구현·튜닝한 뒤 PG로 복제**한다.

### 비범위 (Non-goals)

- 다른 섹션(Hero, Metrics, Calculator, FAQ, CTA, PG의 inbound/advantage/cases)은 그대로 둔다.
- 스무스 스크롤 라이브러리(Lenis)·GSAP·스크롤 하이재킹 도입하지 않는다.
- scroll-snap(섹션 스냅)·풀페이지 전환은 하지 않는다.
- 서버 로직·DB·라우팅 변경 없음. 순수 프론트엔드(랜딩) 작업.

## 3. 디자인 언어 제약 (DESIGN.md §6·§9)

- **transform·opacity만** 애니메이트한다(레이아웃 속성 금지). 확대는 `transform: scale`.
- `prefers-reduced-motion: reduce`를 **존중**한다 — pin·smooth-scroll·스텝 전부 off,
  각 섹션은 오늘의 정적 모습으로 폴백.
- 랜딩/마케팅 면은 모션 예외 구역(이미 타이프라이터·캐러셀·크로스페이드 사용). 단
  "역동적이되 절제된" 선을 지킨다.

## 4. 핵심 프리미티브 — `ScrollPinnedSection`

새 공용 컴포넌트(render-prop). 세 섹션이 재사용한다. 위치: `components/landing/ScrollPinnedSection.tsx`.

### 4.1 API

```tsx
type PinnedState = {
  pinned: boolean;              // false = 폴백(모바일·reduced-motion·마운트 전)
  activeStep: number;           // 0..steps-1 (현재 단계, 스크롤 함수)
  progress: MotionValue<number> | null; // 0..1 연속값(스케일 등), 폴백 시 null
  scrollToStep: (index: number) => void; // 해당 단계의 스크롤 지점으로 smooth 이동
};

function ScrollPinnedSection(props: {
  steps: number;                // 이산 단계 수 (= 4)
  stepVh?: number;              // 단계당 스크롤 이동량(vh). 기본 80. 튜닝 노브.
  className?: string;           // sticky 콘텐츠 래퍼에 적용
  children: (s: PinnedState) => ReactNode;
}): JSX.Element
```

### 4.2 동작

- **`disabled = prefersReducedMotion() || !isLgUp || !mounted`**
  - `prefersReducedMotion()` — `lib/landing/prefers-reduced-motion.ts` 재사용.
  - `isLgUp` — `hooks/use-lg-up.ts`의 `useIsLgUp()` 재사용(`<lg` = 모바일/태블릿 폴백).
  - `mounted` — 하이드레이션 가드. SSR·첫 클라 페인트는 폴백을 렌더하고, 마운트 후
    pin으로 승격한다(레이아웃 시프트/하이드레이션 미스매치 방지). 기존 랜딩 패턴과 동일.
- **`disabled`일 때**: 일반 흐름으로 `children({ pinned: false, activeStep: steps-1, progress: null, scrollToStep: noop })`
  를 렌더한다. 소비처는 `pinned === false`면 **현재(오늘) 마크업**을 그대로 그린다.
- **pin일 때**:
  - 바깥 트랙 `<div ref={trackRef} style={{ height: `${steps * stepVh}vh` }}>`.
  - 안쪽 sticky `<div className="sticky top-[var(--shell-topbar)] h-[calc(100svh-var(--shell-topbar))] flex flex-col justify-center ...">`.
  - `const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })`.
  - `useMotionValueEvent(scrollYProgress, 'change', v => setActiveStep(clamp(Math.floor(v * steps), 0, steps - 1)))`.
  - `progress = scrollYProgress`를 그대로 넘겨 소비처가 연속 transform(스케일)에 쓴다.
  - `scrollToStep(i)` = `window.scrollTo({ top: trackTop + (i + 0.5)/steps * trackHeight, behavior: reduced ? 'auto' : 'smooth' })`
    (트랙 기준 그 단계의 중앙 지점으로 이동). 클릭·스크롤 연동의 핵심.

### 4.3 튜닝 노브

- `stepVh` — 단계당 스크롤 예산. 구매사 랜딩은 연속 3 pin이라 **타이트하게**(예: 60~80)
  잡아 "계속 붙잡히는" 느낌을 줄인다. 눈으로 조정한다.
- Solution이 무겁게 느껴지면 pin 대신 "스크롤 통과하며 강조"(sticky 없이 뷰포트 진행률
  스크럽)로 낮추는 것을 튜닝 단계에서 검토한다. 기본은 pin.

## 5. 섹션별 스펙

### 5.1 Problem (양 랜딩) — 누적 등장

- pin 콘텐츠: `SectionHeading`(고정) + 4개 `ProblemCard`.
- 카드 `i`는 `i <= activeStep`이면 등장(opacity 0→1, y 16→0), 아니면 숨김/투명.
  새로 등장하는 카드만 전환 → 스크롤할수록 1→2→3→4가 아래로 쌓인다. `activeStep === 3`
  이면 4개 모두 표시(= 오늘의 최종 리스트와 동일).
- 전환: 기존 `FadeInView`의 EASE_OUT `[0.16, 1, 0.3, 1]`·거리(y:16) 재사용.
- **폴백(`!pinned`)**: 오늘 마크업 그대로 — 4개 `ProblemCard`를 `FadeInView` 스택으로.

### 5.2 Solution (구매사 전용) — 스크롤 구동, 타이머 제거

- `SolutionShowcase`를 **controlled**로 리팩터한다.
  - **제거**: `useInView` + `setInterval(STEP_MS)` 자동 순환 로직 전체.
  - **추가**: `activeStep?: number | null` prop. 제공되면 그 값으로 강조, 없으면 `null`(평평).
  - 포인트 강조(opacity·scale·체크색)와 `OfferComparisonTable activeStep={activeStep}`
    연동은 **유지**하되 구동원이 스크롤로 바뀐다. 요소별 반응형 전환(500ms opacity 등)은
    살린다(스크롤에 반응해 부드럽게 강조 이동).
- pin 콘텐츠: `SectionHeading`(고정) + `<SolutionShowcase points={SOLUTION_POINTS} activeStep={activeStep} />`.
  `activeStep`(0..3)은 `ScrollPinnedSection`이 스크롤로 구동.
- **폴백(`!pinned`)**: `<SolutionShowcase points={SOLUTION_POINTS} />`(activeStep 미전달 → `null` → 평평한 목록 + 중립 표). 즉 모바일·reduced-motion에선 자동 순환이 사라지고 정적. (= "애니메이션 제거" 취지와 일치)

### 5.3 Demo (양 랜딩) — 클릭·스크롤 단일 타임라인 + 확대

**원칙**: 스텝을 항상 "스크롤 위치의 함수"로 둔다. 클릭은 "그 스텝의 스크롤 지점으로 이동"
으로 통일 → 클릭·스크롤이 싸우지 않고, 클릭 체험 100% 유지.

- `DemoAppShell` / `PgDemoAppShell`에 **controlled 모드** prop 추가(옵셔널):
  - `controlledStep?: number` — 제공되면 `page = controlledStep`, 내부 `useDemoStepAutoplay`
    타이머·`userInteracted` freeze 경로를 **끈다**.
  - `onStepSelect?: (n: number) => void` — 내부 nav 링크·`DemoStepBar` 클릭이 내부
    `setStep` 대신 이걸 호출(래퍼가 `scrollToStep(n-1)`로 연결). 미제공(기본)이면 현행 동작.
  - `scrollLocked?: boolean` — true면 데모 내부 스크롤 영역 `overflow-y-auto → overflow-hidden`
    (휠이 항상 페이지 스크롤=스텝 전진으로 가게). pin일 때 true.
  - **prop 미제공 시 동작은 오늘과 100% 동일**(diff 최소화, 기존 테스트 green 유지).
- pin 래퍼(신규 소비 컴포넌트, 예: `ScrollDrivenDemo` — 각 랜딩 내부 또는 공용):
  - `activeStep(0..3)` → `controlledStep = activeStep + 1`.
  - `progress` → `scale = useTransform(progress, [0, 1], [0.95, 1])`를 데모 목업 래퍼에 적용
    (transform scale, GPU 합성). "스크롤 내릴수록 살짝 커짐."
  - 데모 내부 클릭/StepBar → `onStepSelect(n)` → `scrollToStep(n - 1)`.
  - `scrollLocked`는 pin 동안 true.
- **폴백(`!pinned`)**: `<DemoAppShell />`(prop 없이) — 오늘의 타이머 자동재생 + 자유 클릭 그대로.

## 6. 폴백 요약 (모바일 `<lg` · reduced-motion · 마운트 전)

| 섹션 | pin(desktop, motion on) | 폴백 |
|---|---|---|
| Problem | 누적 등장(스크롤) | FadeInView 4카드 스택 (오늘) |
| Solution | 강조+표 연동(스크롤) | 평평한 목록 + 중립 표 (오늘의 reduced-motion) |
| Demo | 클릭·스크롤 연동 + 확대 | 타이머 자동재생 + 자유 클릭 (오늘) |

폴백은 모두 **현재 코드 경로를 그대로 재사용**하므로, jsdom(=reduced-motion true) 유닛
테스트는 폴백 경로만 타 기존 자산을 깨지 않는다.

## 7. 공용 유틸 정리 (선택)

- `EASE_OUT = [0.16, 1, 0.3, 1]`가 7개 파일에 중복. 모션 코드를 추가하는 김에
  `lib/landing/ease.ts`로 추출해 신규·기존 소비처가 공유(선택적 클린업, 행위 불변).

## 8. 성능·UX 고려

- 연속 3 pin(구매사): `stepVh`를 타이트하게, 튜닝으로 흐름 확보. 필요 시 Solution un-pin.
- 확대·이동은 transform/opacity만. 데모 목업 래퍼에 `will-change: transform` 힌트.
- sticky는 `top-[var(--shell-topbar)]`(고정 헤더 아래)에 붙인다.
- 데모 pin 동안 내부 세로 스크롤 잠금(`scrollLocked`)으로 nested-scroll 충돌 방지.
- `scrollToStep`의 smooth는 reduced-motion에서 `auto`(즉시)로. (단 그 경우 애초에 pin off)

## 9. 테스트 방침

- 랜딩 작업은 프로젝트 관례상 **TDD 면제**(눈으로 튜닝 + `/design-review`). 단 유닛
  스위트·`tsc --noEmit`·`lint`는 **green 유지**.
- **명시적 테스트 갱신 필요**: `SolutionShowcase.test.tsx` — 타이머 순환 기반 단언을
  controlled(`activeStep` prop) 모델로 재작성. (타이머 제거로 기존 단언은 무효)
- `DemoAppShell`/`PgDemoAppShell`: 옵셔널 prop 추가·기본 동작 불변 → 기존 테스트 green.
- `ScrollPinnedSection`: jsdom엔 `matchMedia` 없음 → `prefersReducedMotion()=true` →
  항상 폴백 렌더. 필요한 최소 단위 테스트는 "폴백 시 children을 pinned=false로 렌더"
  수준(모션 동작은 실제 브라우저 눈 검증).
- 배포 후 데스크톱 실브라우저에서 세 섹션 스크롤·클릭 연동·확대·모바일 폴백 육안 확인.

## 10. 열린 튜닝 노브 (구현 중 눈으로 결정)

- `stepVh`(단계당 스크롤 예산), 데모 확대 범위(기본 0.95→1.0), Problem 누적 카드의
  등장 거리/딜레이, Solution pin 유지 여부.
