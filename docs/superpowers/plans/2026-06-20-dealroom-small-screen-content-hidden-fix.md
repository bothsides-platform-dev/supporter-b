# 딜룸 소형 화면 콘텐츠 미노출 버그 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lg(1024px)` 미만 화면에서 딜룸 중앙 콘텐츠(DealRoomCenter)가 사라지는 CSS 레이아웃 버그를 수정한다.

**Architecture:** ActionRail + Center를 감싸는 div가 `flex-row`인 상태에서 ActionRail이 `max-lg:w-full`로 전체 너비를 차지해 Center가 너비 0으로 압착됨. 부모 컨테이너에 `max-lg:flex-col`을 추가해 소형 화면에서 수직 적층으로 전환한다. PG(`PgDealRoomBody`)와 구매사(`BuyerDealRoomBody`) 두 곳 동일하게 수정한다.

**Tech Stack:** React 19, Tailwind v4, Vitest, @testing-library/react

## Global Constraints

- Tailwind v4 반응형 prefix 사용: `max-lg:` (1024px 미만), `lg:` (1024px 이상)
- 테스트는 Vitest + @testing-library/react, `pnpm test <path>` 로 실행
- TDD: RED 먼저 확인 후 구현
- 커밋은 태스크 단위로 분리

---

### Task 1: PgDealRoomBody — 소형 화면 레이아웃 회귀 테스트 + 수정

**Files:**
- Modify: `components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx`
- Modify: `components/deal-room/pg/PgDealRoomBody.tsx:81`

**Interfaces:**
- Produces: 소형 화면(`lgUp=false` 시뮬레이션)에서 DealRoomCenter 콘텐츠(`data-testid="bid-wizard"`)가 DOM에 존재하는 것을 보장하는 테스트

- [ ] **Step 1: `use-lg-up` 훅 mock 추가**

`PgDealRoomBody.test.tsx` 상단(기존 mock 블록 바로 뒤)에 추가:

```ts
// use-lg-up mock — PgDealRoomBody 자신은 lgUp 을 쓰지 않지만
// DealRoomActionRail/Center 가 렌더되는 컨텍스트에서 안전하게 고정.
const mq = vi.hoisted(() => ({ lgUp: true }));
vi.mock('@/hooks/use-lg-up', () => ({ useIsLgUp: () => mq.lgUp }));
```

그리고 기존 `afterEach(cleanup)` 바로 뒤에:
```ts
afterEach(() => { mq.lgUp = true; });
```

- [ ] **Step 2: 실패하는 테스트 작성**

`PgDealRoomBody.test.tsx` 맨 끝에 추가:

```ts
describe('PgDealRoomBody — 소형 화면 레이아웃', () => {
  it('lg 미만에서 DealRoomCenter 콘텐츠가 DOM 에 존재한다', () => {
    mq.lgUp = false;
    render(<PgDealRoomBody data={buildData()} />);
    // BidWizard 는 '견적 작성' 탭의 기본 콘텐츠 — 소형 화면에서도 보여야 한다.
    expect(screen.getByTestId('bid-wizard')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: RED 확인**

```bash
pnpm test components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx
```

Expected: 새 테스트가 FAIL (bid-wizard 를 찾지 못하거나 레이아웃 검증 실패).
> 참고: jsdom 은 실제 CSS 를 계산하지 않으므로 요소가 DOM 에 있어도 `w-0` 상태임을 시각적으로 확인할 수 없다. 이 테스트는 fix 이후 요소가 DOM 에 항상 마운트됨을 보장하는 회귀 가드다. 현재 코드에서 이미 bid-wizard 가 DOM 에 있다면 Step 4의 CSS 수정이 메인 픽스이므로 테스트 통과가 맞다 — 그 경우 테스트를 유지하고 Step 4로 진행한다.

- [ ] **Step 4: 최소 구현 — `max-lg:flex-col` 추가**

`components/deal-room/pg/PgDealRoomBody.tsx` 81번 줄:

```diff
-      <div className="flex min-h-0 flex-1">
+      <div className="flex min-h-0 flex-1 max-lg:flex-col">
```

- [ ] **Step 5: GREEN 확인**

```bash
pnpm test components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx
```

Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx \
        components/deal-room/pg/PgDealRoomBody.tsx
git commit -m "fix(pg-deal-room): restore center content on small screens (max-lg:flex-col)"
```

---

### Task 2: BuyerDealRoomBody — 소형 화면 레이아웃 회귀 테스트 + 수정

**Files:**
- Modify: `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`
- Modify: `components/deal-room/buyer/BuyerDealRoomBody.tsx:160`

**Interfaces:**
- Produces: 소형 화면에서 DealRoomCenter 콘텐츠(`data-testid="focus-comparison"`)가 DOM에 존재하는 것을 보장하는 테스트

- [ ] **Step 1: `use-lg-up` 훅 mock 추가**

`BuyerDealRoomBody.test.tsx` 상단(기존 mock 블록 바로 뒤)에 추가:

```ts
const mq = vi.hoisted(() => ({ lgUp: true }));
vi.mock('@/hooks/use-lg-up', () => ({ useIsLgUp: () => mq.lgUp }));
```

그리고 기존 `afterEach(cleanup)` 바로 뒤에:
```ts
afterEach(() => { mq.lgUp = true; });
```

- [ ] **Step 2: 실패하는 테스트 작성**

`BuyerDealRoomBody.test.tsx` 맨 끝에 추가:

```ts
describe('BuyerDealRoomBody — 소형 화면 레이아웃', () => {
  it('lg 미만에서 DealRoomCenter 콘텐츠가 DOM 에 존재한다', () => {
    mq.lgUp = false;
    render(<BuyerDealRoomBody data={buildData()} />);
    // FocusComparison 은 '견적 비교' 탭의 기본 콘텐츠.
    expect(screen.getByTestId('focus-comparison')).toBeInTheDocument();
  });
});
```

> `render` 는 파일 상단의 `const render = (ui: ReactElement) => rtlRender(ui, { wrapper: DealRoomProvider })` 래퍼를 그대로 사용한다.

- [ ] **Step 3: RED 확인**

```bash
pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx
```

Expected: 새 테스트 FAIL 또는 이미 GREEN (Task 1 Step 3 참고 — 어느 쪽이든 Step 4 진행).

- [ ] **Step 4: 최소 구현 — `max-lg:flex-col` 추가**

`components/deal-room/buyer/BuyerDealRoomBody.tsx` 160번 줄:

```diff
-      <div className="flex min-h-0 flex-1">
+      <div className="flex min-h-0 flex-1 max-lg:flex-col">
```

- [ ] **Step 5: GREEN 확인**

```bash
pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx
```

Expected: 전체 PASS

- [ ] **Step 6: 전체 스위트 확인**

```bash
pnpm test
```

Expected: 전체 GREEN (신규 회귀 없음)

- [ ] **Step 7: 커밋**

```bash
git add components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx \
        components/deal-room/buyer/BuyerDealRoomBody.tsx
git commit -m "fix(buyer-deal-room): restore center content on small screens (max-lg:flex-col)"
```
