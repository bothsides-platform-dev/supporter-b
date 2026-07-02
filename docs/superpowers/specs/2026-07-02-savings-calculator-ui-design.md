# 랜딩 절감액 계산기(SavingsCalculator) UI 개선

**Status:** Approved
**Date:** 2026-07-02
**Scope:** `components/landing/SavingsCalculator.tsx`, `components/landing/CostComparisonChart.tsx`

## 배경

랜딩 히어로(`#calculator` 섹션, `components/landing/LandingHero.tsx:143`)의 절감액 계산기는 기능은 동작하지만 시각적으로 "완성된 제품"보다는 "실험적"으로 보인다는 문제의식에서 출발했다. 슬라이더 영역·결과·차트가 각각 느슨하게 나열되어 있고, 결과 숫자에 색상 강조가 없으며, 등급 산정 근거가 드러나지 않는다.

**목표**: 신뢰감/완성도 향상. B2B SaaS 계산기(Stripe/Ramp류 ROI 계산기)를 참고하되, 프로젝트의 Linear 디자인 하드룰(`DESIGN.md`, `CLAUDE.md`)은 그대로 유지한다 — 무거운 그림자·그라데이션·글래스모피즘 같은 MD3 시각 요소는 도입하지 않는다.

## 현재 구조의 문제

`SavingsCalculator.tsx`의 루트는 `border-t border-b`(위아래 수평선)만 두른 `<section>`이라, 슬라이더·결과·차트가 "선 사이에 나열된 콘텐츠"처럼 보인다. 결과 영역만 자체 `rounded-lg border bg-tertiary-container/20` 박스를 갖고 있어 박스-안-박스 느낌도 있다. 절감액 숫자는 공유 컴포넌트 `KpiCell`을 그대로 써서 `on-surface`(중립색) 고정이라 "좋은 소식"이라는 신호가 색으로 전달되지 않는다. "가맹점 등급" Chip은 라벨만 보여줄 뿐 산정 기준을 설명하지 않는다.

## 채택한 방향

브라우저 목업으로 3가지 레이아웃(결과 우선 배너 / 입력 사이드바+출력 패널 / 세로 단일 흐름)을 비교한 뒤 **입력 사이드바 + 출력 패널** 구조를 확정했다.

### 구조

루트를 하나의 통합 카드로 바꾼다:

```
<section> (rounded-lg border border-outline-variant bg-surface-container-low)
  grid grid-cols-1 md:grid-cols-[260px_1fr]
  ├─ 좌: 입력 사이드바 (md:border-r border-outline-variant)
  │    ├─ 슬라이더: 연간 거래액
  │    ├─ 슬라이더: 현재 PG 수수료율
  │    └─ 가맹점 등급 Chip + info 아이콘(툴팁)
  └─ 우: 출력 패널
       ├─ 절감액 숫자 (36px, tertiary 색)
       └─ border-t 구분선 아래 CostComparisonChart
  각주 (카드 하단, 전체 폭)
```

모바일(`<md`)에서는 그리드가 1컬럼으로 접혀 사이드바가 위, 출력 패널이 아래로 세로 배치된다(기존 `grid-cols-1 md:grid-cols-[1fr_auto]` 패턴과 동일한 반응형 전략).

### 결과 숫자 강조

절감액 숫자는 공유 `KpiCell`(앱 대시보드 전역 컴포넌트, `on-surface` 고정)을 그대로 쓰지 않고, 같은 페이지의 `MetricCard`와 동일한 타이포 언어(큰 사이즈 + `tabular-nums`)로 커스텀 마크업을 작성한다. 색은 `tertiary`(DESIGN.md의 "성공/완료" 색 매핑, `CostComparisonChart`가 이미 절감액 텍스트에 쓰는 색과 동일)로 지정해 "좋은 숫자"라는 신호를 색으로 전달한다. `KpiCell` 자체는 수정하지 않는다(다른 화면에 영향 없음).

### 등급 근거 툴팁

"가맹점 등급" Chip 옆에 작은 info 아이콘을 추가하고, 기존 `components/ui/tooltip.tsx`를 사용해 등급 구간(`lib/landing/savings.ts`의 `gradeFromVolume` 임계값 — 연 거래액 3억/5억/10억/30억 기준)을 텍스트로 보여준다. 새 컴포넌트를 만들지 않고 기존 Tooltip을 그대로 재사용한다.

### 절감액 숫자 트윈 애니메이션

`MetricCard.tsx`의 `useCountUp`과 같은 rAF 기반 보간 기법을 `lib/landing/use-animated-number.ts` 훅으로 추출해 재사용한다. 기존 `useCountUp`은 "화면 진입 시 0→목표값 1회 재생"용이라 그대로 못 쓴다 — 새 훅은 값이 바뀔 때마다(슬라이더 드래그 중 연속적으로) 현재 표시값→새 목표값을 ~200ms easeOut으로 보간하고, 진행 중에 새 목표가 들어오면 중단 없이 새 목표로 이어서 애니메이션한다(`requestAnimationFrame` 매 틱마다 시작점을 현재 표시값으로 재설정).

인터페이스: `useAnimatedNumber(target: number, durationMs?: number): number` — 표시할 보간된 숫자를 반환한다. `SavingsCalculator`의 절감액 숫자에만 적용한다(차트 바 라벨은 이미 바 자체가 애니메이트되므로 범위에서 제외 — YAGNI).

### 드래그 중 실시간 값 버블

기존 idle-hint(자동 데모 커서 + "드래그해서 조정해 보세요" 말풍선) 마크업을 재사용한다. 사용자가 실제로 슬라이더를 드래그하는 동안(pointer down~up) 같은 화살표+말풍선 위치에 안내 문구 대신 **실시간 값**(예: "492억", "2.40%")을 보여준다. 드래그가 끝나면 사라진다.

구현은 `SavingsCalculator.tsx`에서 각 슬라이더를 감싸는 wrapper `div`에 `onPointerDown`/`onPointerUp`/`onPointerCancel`을 붙여 로컬 `isDragging` state를 토글하는 방식으로 한다. `components/ui/slider.tsx`(공유 컴포넌트, 앱 전역에서 쓰임)는 수정하지 않는다 — pointer 이벤트는 Radix Thumb→Root→wrapper로 버블링되므로 wrapper에서만 처리 가능하다.

idle-hint 자동 데모와는 상호 배타적이지 않다: 기존처럼 `interactedRef`가 최초 실제 조작 시 idle 데모를 영구 중단시키므로, "자동 데모 → 실제 드래그 시 값 버블"의 자연스러운 전환이 이미 보장된다.

## 변경 파일 범위

| 파일 | 변경 내용 |
|---|---|
| `components/landing/SavingsCalculator.tsx` | 구조 재작성(그리드 260px 사이드바), 결과 숫자 커스텀 마크업, 등급 툴팁, `useAnimatedNumber` 적용, 드래그 값 버블 |
| `components/landing/CostComparisonChart.tsx` | 패딩/구분선만 정리(출력 패널 안에 자연스럽게 이어지도록 — 로직 변경 없음) |
| `lib/landing/use-animated-number.ts` (신규) | rAF 기반 숫자 보간 훅 |
| `components/landing/__tests__/SavingsCalculator.test.tsx` | 새 마크업(사이드바/출력 패널 구조, 툴팁, 애니메이션 숫자)에 맞게 갱신 |

**변경하지 않는 파일**(공유 컴포넌트, 읽기만 함): `components/ui/slider.tsx`, `components/ui/tooltip.tsx`, `components/primitives/KpiCell.tsx`, `components/landing/MetricCard.tsx`(참고용으로만 참조).

## 테스트 전략

이전 랜딩 작업(`docs/superpowers/specs/` 히스토리, 다크 오프닝 씬 등)과 동일하게 이번에도 TDD Iron Law 예외를 적용한다 — 상태/핸들러가 추가되는 랜딩 전용 작업은 눈으로 반복 조정하며 진행하고, 대신:

- 기존 `SavingsCalculator.test.tsx`를 새 마크업/동작에 맞게 갱신해 그린 유지
- `pnpm tsc --noEmit`, `pnpm lint` 클린
- 로컬 dev 서버에서 실제 드래그·툴팁·애니메이션 동작 육안 확인
- 필요 시 `/design-review`로 마무리 QA

공유 컴포넌트(`ui/slider.tsx`, `ui/tooltip.tsx`, `KpiCell`)는 코드를 수정하지 않으므로 이 변경으로 인한 회귀 위험은 `SavingsCalculator`/`CostComparisonChart`/신규 훅에 국한된다.

## 범위 밖 (Out of scope)

- `KpiCell` 자체의 색상 로직 변경(앱 전역 대시보드 컴포넌트 — 이번 스코프에서 건드리지 않음)
- 차트 바 라벨의 숫자 애니메이션(바 자체는 이미 motion으로 애니메이트되어 우선순위 낮음, YAGNI)
- 계산 로직(`lib/landing/savings.ts`)의 등급 산정 기준 자체 변경 — 이번 작업은 UI 표현만 다룬다
