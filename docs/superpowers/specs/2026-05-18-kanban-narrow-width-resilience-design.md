# 칸반보드 좁은 폭 회귀 방지

작성일: 2026-05-18
대상: `components/home/Kanban*.tsx` (3개 파일)
스코프: CSS class 조정만. 컴포넌트 구조·DnD 동작·도메인 로직 무변경.

## 문제

현재 칸반보드는 `md:` (≥768px) 이상에서 `grid-cols-6`로 6컬럼을 렌더한다. 컬럼 간 `gap-3`(12px)를 빼면 컬럼당 가용폭은:

| 뷰포트 | 컬럼당 폭 |
|---|---|
| md 768 | 118px |
| lg 1024 | 161px |
| xl 1280 | 203px |

카드 헤더 한 줄에 필요한 최소폭은 `RFP ID(P-2605-0042, ~83px) + gap(8) + Chip(D-3, ~48px) + 카드 패딩(24) ≈ 163px`. **md 구간에서 RFP ID와 Chip 중 한쪽이 카드 모서리를 뚫고 나가 둥근 모서리가 깨져 보임.** 푸터 "초대 PG N · 응답 X/Y" 줄도 동일.

`md:w-auto` 가 적용되어 그리드 트랙이 카드 폭을 강제하기 때문에 카드는 컬럼보다 좁아지지 못하고, `flex justify-between` 의 두 자식은 줄바꿈 없이 컨테이너를 뚫는다.

## 해결 전략 (A + C 하이브리드)

- **A: Grid breakpoint 상향 (md → lg)** — 1024px 미만은 무조건 가로 스크롤 + 288px 카드 모드를 유지해 그리드 좁힘 자체를 회피.
- **C: 카드/컬럼 자체 견고화** — 그리드 모드(lg 이상)에서도 어떤 콘텐츠가 들어오든 안 깨지도록 `min-w` 안전망 + `flex-wrap` 흘림.

A 단독: lg(161px)에서도 빠듯하고, 미래에 RFP 코드 포맷이 길어지거나 카드 필드가 추가되면 또 깨짐.
C 단독: md 구간 카드가 시각적으로 너무 답답함.
하이브리드: lg 미만은 충분한 폭의 스크롤, lg 이상은 그리드 + 안전망. 양쪽 다 커버.

## 변경 상세

### 1) `components/home/KanbanBoard.tsx`

Buyer/PG 양쪽 `<div role="region">` wrapper className 의 `md:` → `lg:` (2곳):

```diff
- "flex md:grid md:grid-cols-6 gap-3 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory pb-4"
+ "flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto lg:overflow-x-visible snap-x snap-mandatory pb-4"
```

### 2) `components/home/KanbanColumn.tsx`

컬럼 `<section>` className:

```diff
- "flex flex-col w-72 md:w-auto shrink-0 snap-start bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px] transition-colors"
+ "flex flex-col w-72 lg:w-auto lg:min-w-[160px] shrink-0 snap-start bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px] transition-colors"
```

`lg:min-w-[160px]` 는 그리드가 만에 하나 더 좁아져도 (zoom, 부모 컨테이너 변경 등) 카드 내부 콘텐츠가 깨지지 않을 안전선.

### 3) `components/home/KanbanCard.tsx`

**Buyer 헤더** (`BuyerCardBody`):
```diff
- <div className="flex items-start justify-between gap-2">
+ <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
```

**PG 헤더** (`PgCardBody`): 동일 변경.

**Buyer 푸터** (초대/응답 카운트 줄):
```diff
- <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2">
+ <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
```

PG 푸터는 자식 1개라 무변경.

## 동작 검증

브라우저 수동 검증 (`pnpm dev`):

뷰포트별로 `/home` (buyer/pg 양쪽) 확인:

| 폭 | 기대 동작 |
|---|---|
| 320 | 가로 스크롤, 288px 카드, snap |
| 600 | 동일 |
| 767 | 동일 |
| 1023 | 동일 (변경 전엔 여기서 그리드로 전환되며 깨졌음) |
| 1024 | 6컬럼 그리드 첫 진입. 카드 헤더 한 줄 유지 |
| 1280 | 그리드, 여유 있음 |
| 1536 | 그리드, 여유 있음 |

엣지 케이스: 일부러 긴 RFP 코드를 시드해서 lg 진입 직후 헤더가 2줄로 자연스럽게 흐르는지 확인.

DnD 회귀: 모든 변경이 className-only 이고 `useDraggable`/`useDroppable` id 와 핸들러 무변경 → drag matrix 회귀 없음. 기존 `components/home/__tests__/dragMatrix.test.ts` 통과 확인.

## 비범위

- Container queries (Tailwind v4 `@container`) 도입 — 이 정도 스코프에는 과함
- Storybook / visual regression infra — 프로젝트에 없음, 별도 이니셔티브
- 카드 내부 시각 디자인 변경 (폰트 크기, 패딩, Chip 모양) — DESIGN.md 영역
- 카드/컬럼 reorder, 컬럼 수 변경 — 도메인 변경

## 위험

낮음. CSS class만 조정, 도메인·DnD·접근성 속성 무변경. 단일 PR 권장.
