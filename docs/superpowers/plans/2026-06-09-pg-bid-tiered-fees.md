# PG 견적 구간별(영세/중소/일반) 수수료 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG가 견적을 작성할 때 카드·간편결제 수단을 묶어 영세/중소1/중소2/중소3/일반 5구간 매트릭스로 수수료를 제안하고, 구매사 상세·비교·견적 템플릿까지 구간을 반영한다.

**Architecture:** `bids.paymentFees`(JSONB) 값 타입을 `number | TierRates` union으로 넓힌다(구간 수단=구간맵, 그 외=number). "구간 수단인지"는 카테고리 상수(`isTieredMethod`)로 판별하고, 모든 읽기는 관대한 접근자(`getMethodRate`)를 거쳐 구버전 number 데이터와 호환한다. **DB DDL/마이그레이션 없음.**

**Tech Stack:** Next 16 App Router, React 19, TypeScript strict, Drizzle(JSONB), zod v4, Vitest + PGlite, Tailwind v4.

**스펙:** `docs/superpowers/specs/2026-06-09-pg-bid-tiered-fees-design.md`

---

## 사전 준비 (필수)

- **worktree에서 작업** (CLAUDE.md 규칙). 브랜치명 `feat/pg-bid-tiered-fees`.
- **테스트는 node 20으로 실행** (homebrew node26는 jsdom localStorage를 깬다 — 메모리 [[node26-breaks-jsdom-localstorage]]). 모든 `pnpm test` 명령 앞에 prefix를 붙인다:
  ```bash
  PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test <path>
  ```
  아래 모든 RUN 단계는 이 prefix를 생략 표기하지만 **반드시 붙여 실행**한다.
- 단일 파일 RED/GREEN 확인은 항상 단일 경로로. 전체 그린은 마지막 Task에서.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/types/bid.ts` | 도메인 타입·상수·접근자 | MERCHANT_TIERS / TierRates / isTieredMethod / getMethodRate 추가, `Bid.paymentFees`·`QuoteTemplateOption.paymentFees` union화 |
| `lib/types/__tests__/bid-tiers.test.ts` | 접근자 단위테스트 | 신규 |
| `components/inbox/useBidDraft.ts` | 견적 draft localStorage | `__v` 2→3, 복합 키 |
| `components/inbox/bid-wizard/BidStepFees.tsx` | PG 수수료 입력 UI | 매트릭스 + 단일입력 |
| `components/inbox/bid-wizard/BidWizard.tsx` | wizard 상태/조립 | buildPaymentFees·anyFeeFilled·applyTemplate |
| `components/inbox/bid-wizard/BidStepReview.tsx` | 발송 전 검토 | 구간 요약 표시 |
| `lib/server/actions/bid/submitBidAction.ts` | submit 진입점 zod | PaymentFeesSchema union |
| `lib/server/services/bid.ts` | submit 비즈니스 로직 | 입력 타입 union, 요청외 수단 검증 |
| `lib/server/repositories/drizzle/bid.ts` | bid 영속/투영 | rowToBid 캐스트 union |
| `components/rfp/comparison/FocusComparison.tsx` | 구매사 비교+상세 | 구간 셀렉터, getMethodRate, 읽기전용 매트릭스 |
| `components/rfp/comparison/ImprovementSummary.tsx` | 비교 hero | tier prop, getMethodRate |
| `lib/server/actions/quote-template/saveQuoteTemplateAction.ts` | 템플릿 저장 zod | PaymentFeesSchema union |
| `components/settings/QuoteTemplatesPanel.tsx` | 템플릿 목록 미리보기 | 구간 수단 표기 |

**DB 스키마(`lib/db/schema/bids.ts`)·라우트·RFP 작성 화면은 변경하지 않는다.**

---

## Task 1: 구간 도메인 — 상수·타입·접근자 (additive)

**Files:**
- Modify: `lib/types/bid.ts` (상단 `PAYMENT_METHOD_CATEGORIES` 아래에 추가)
- Test: `lib/types/__tests__/bid-tiers.test.ts` (신규)

이 Task는 순수 추가다. `Bid.paymentFees` 타입은 아직 바꾸지 않는다(Task 2에서).

- [ ] **Step 1: 실패하는 테스트 작성**

Create `lib/types/__tests__/bid-tiers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  getMethodRate,
} from '@/lib/types/bid';

describe('merchant tiers', () => {
  it('정확히 5구간을 순서대로 노출한다', () => {
    expect(MERCHANT_TIERS).toEqual(['sole', 'sme1', 'sme2', 'sme3', 'general']);
    expect(MERCHANT_TIER_LABELS.sole).toBe('영세');
    expect(MERCHANT_TIER_LABELS.general).toBe('일반');
  });
});

describe('isTieredMethod', () => {
  it('카드·간편결제 카테고리만 true', () => {
    expect(isTieredMethod('card')).toBe(true);
    expect(isTieredMethod('overseas_card')).toBe(true);
    expect(isTieredMethod('naver_pay')).toBe(true);
    expect(isTieredMethod('kakao_pay')).toBe(true);
    expect(isTieredMethod('toss_pay')).toBe(true);
  });
  it('계좌·기타는 false', () => {
    expect(isTieredMethod('virtual_account')).toBe(false);
    expect(isTieredMethod('bank_transfer')).toBe(false);
    expect(isTieredMethod('mobile')).toBe(false);
    expect(isTieredMethod('gift_card')).toBe(false);
  });
});

describe('getMethodRate', () => {
  it('구간맵이면 해당 구간 값', () => {
    expect(getMethodRate({ sole: 0.005, general: 0.018 }, 'sole')).toBe(0.005);
    expect(getMethodRate({ sole: 0.005, general: 0.018 }, 'general')).toBe(0.018);
  });
  it('구간맵에 없는 구간이면 undefined', () => {
    expect(getMethodRate({ sole: 0.005 }, 'sme2')).toBeUndefined();
  });
  it('number(구버전 단일요율)면 구간 무관 그 값', () => {
    expect(getMethodRate(0.0125, 'sole')).toBe(0.0125);
    expect(getMethodRate(0.0125, 'general')).toBe(0.0125);
  });
  it('undefined면 undefined', () => {
    expect(getMethodRate(undefined, 'general')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test lib/types/__tests__/bid-tiers.test.ts`
Expected: FAIL — `MERCHANT_TIERS`/`isTieredMethod`/`getMethodRate` is not exported.

- [ ] **Step 3: 최소 구현**

`lib/types/bid.ts`의 `PAYMENT_METHOD_CATEGORIES` 정의 바로 아래에 추가:
```ts
// ─── 영세·중소가맹점 우대수수료 구간 (여신금융협회 기준 고정 5종) ────────────────
export const MERCHANT_TIERS = ['sole', 'sme1', 'sme2', 'sme3', 'general'] as const;
export type MerchantTier = (typeof MERCHANT_TIERS)[number];
export const MERCHANT_TIER_LABELS: Record<MerchantTier, string> = {
  sole: '영세',
  sme1: '중소1',
  sme2: '중소2',
  sme3: '중소3',
  general: '일반',
};

// 소수 요율의 구간맵 (부분 허용 — 일부 구간만 채워도 됨)
export type TierRates = Partial<Record<MerchantTier, number>>;

// 구간이 적용되는 카테고리 라벨 (PAYMENT_METHOD_CATEGORIES.label 기준)
export const TIERED_CATEGORY_LABELS = ['카드', '간편결제'] as const;

const TIERED_METHODS: ReadonlySet<PaymentMethod> = new Set(
  PAYMENT_METHOD_CATEGORIES.filter((c) =>
    (TIERED_CATEGORY_LABELS as readonly string[]).includes(c.label),
  ).flatMap((c) => c.methods),
);

/** 카테고리 상수로만 판별 — 저장된 값의 모양에 의존하지 않는다. */
export function isTieredMethod(m: PaymentMethod): boolean {
  return TIERED_METHODS.has(m);
}

/**
 * 관대한 요율 접근자. value가 number면 구버전 단일요율로 해석(구간 무관),
 * 구간맵이면 해당 구간 값(없으면 undefined). 모든 읽기 사이트가 이 함수를 거친다.
 */
export function getMethodRate(
  value: number | TierRates | undefined,
  tier: MerchantTier,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return value[tier];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test lib/types/__tests__/bid-tiers.test.ts`
Expected: PASS (전부).

- [ ] **Step 5: 커밋**

```bash
git add lib/types/bid.ts lib/types/__tests__/bid-tiers.test.ts
git commit -m "feat(bid): 영세·중소 우대수수료 구간 상수·접근자 추가"
```

---

## Task 2: paymentFees 타입 union화 + 읽기 사이트 접근자 전환

`Bid.paymentFees`·`QuoteTemplateOption.paymentFees`를 `number | TierRates`로 넓히고, number를 직접 산술하던 읽기 사이트를 `getMethodRate`로 바꿔 컴파일을 유지한다. **동작 변화 없음**(기존 데이터는 전부 number라 getMethodRate가 그대로 반환). 검증은 `tsc` + 기존 테스트 그린.

**Files:**
- Modify: `lib/types/bid.ts:54` (`paymentFees`), `:73` (`QuoteTemplateOption.paymentFees`)
- Modify: `lib/server/repositories/drizzle/bid.ts:66`
- Modify: `lib/server/services/bid.ts:29`
- Modify: `lib/server/actions/bid/submitBidAction.ts:60`
- Modify: `lib/server/actions/quote-template/saveQuoteTemplateAction.ts`
- Modify: `components/rfp/comparison/ImprovementSummary.tsx:48-55`
- Modify: `components/rfp/comparison/FocusComparison.tsx:52, 79-86, 149`

- [ ] **Step 1: Bid·QuoteTemplate 타입 union화**

`lib/types/bid.ts`:
```ts
// Bid (line ~54)
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
```
```ts
// QuoteTemplateOption (line ~73)
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
```

- [ ] **Step 2: repo rowToBid 캐스트 넓히기**

`lib/server/repositories/drizzle/bid.ts:66`:
```ts
    paymentFees: (row.paymentFees ?? {}) as Partial<Record<PaymentMethod, number | TierRates>>,
```
파일 상단 import에 `TierRates` 추가:
```ts
import type { Bid, PaymentMethod, TierRates } from '@/lib/types/bid';
```

- [ ] **Step 3: 서비스 입력 타입 넓히기**

`lib/server/services/bid.ts:24-33` `SubmitBidServiceInput`:
```ts
  paymentFees: Record<string, number | import('@/lib/types/bid').TierRates>;
```
(요청외 수단 검증은 `Object.keys(input.paymentFees)` 기반이라 그대로 동작 — 키는 수단명.)

- [ ] **Step 4: submit 액션 캐스트 넓히기**

`lib/server/actions/bid/submitBidAction.ts:60`:
```ts
      paymentFees: parsed.data.paymentFees as Record<string, number | import('@/lib/types/bid').TierRates>,
```
(zod 스키마는 Task 7에서 union 수용으로 확장. 지금은 number만 통과해도 무방.)

- [ ] **Step 5: ImprovementSummary — getMethodRate 경유**

`components/rfp/comparison/ImprovementSummary.tsx`. import에 추가:
```ts
import { getMethodRate, type Bid, type MerchantTier } from '@/lib/types/bid';
```
시그니처에 tier prop 추가(기본 general은 호출부에서 전달; Task 8에서 셀렉터 연동):
```ts
export function ImprovementSummary({
  bid,
  current,
  tier = 'general',
}: {
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
}) {
```
카드 행(48-55)을 접근자로:
```ts
        {(() => {
          const cardRate = getMethodRate(bid.paymentFees.card, tier);
          return cardRate !== undefined ? (
            <NumericRow
              testId="metric-row-card"
              label="카드 수수료"
              currentText={current.feeRate}
              proposedText={formatPct(cardRate)}
              badge={feeBadge(current.feeRate, cardRate)}
            />
          ) : null;
        })()}
```

- [ ] **Step 6: FocusComparison — 정렬·feeRows·peek를 getMethodRate로 (tier='general' 고정, 셀렉터는 Task 8)**

`components/rfp/comparison/FocusComparison.tsx`. import 교체:
```ts
import {
  PAYMENT_METHOD_LABELS,
  getMethodRate,
  type Bid,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
```
정렬(52):
```ts
        (a, b) =>
          (getMethodRate(a.paymentFees.card, 'general') ?? Infinity) -
          (getMethodRate(b.paymentFees.card, 'general') ?? Infinity),
```
feeRows getValue(79-86):
```ts
  for (const method of Object.keys(active.paymentFees) as PaymentMethod[]) {
    feeRows.push({
      key: method,
      label: PAYMENT_METHOD_LABELS[method],
      getValue: (b) => getMethodRate(b.paymentFees[method], 'general') ?? null,
      baseline: method === 'card' ? current.feeRate : undefined,
    });
  }
```
peek 카드(149):
```ts
              <PeekRow
                label="카드"
                value={(() => {
                  const r = getMethodRate(peek.paymentFees.card, 'general');
                  return r !== undefined ? formatPct(r) : '—';
                })()}
              />
```

- [ ] **Step 7: saveQuoteTemplateAction 캐스트(있다면) — 타입만**

`saveQuoteTemplateAction.ts`에서 `paymentFees`를 repo로 넘길 때 타입 에러가 나면 `as Partial<Record<PaymentMethod, number | TierRates>>` 캐스트. (zod는 Task 10에서 확장.) tsc 에러가 없으면 이 스텝은 생략.

- [ ] **Step 8: 타입체크 + 기존 테스트 그린 확인**

Run: `pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'" | grep -E "comparison|bid|types" || echo "no new tsc errors"`
Expected: 신규 에러 없음. (clean HEAD의 wizard test globals 에러는 무관 — 메모리 [[typecheck-red-wizard-test-globals]].)

Run: `pnpm test components/rfp/comparison lib/server/actions/bid lib/server/services/__tests__/bid.test.ts`
Expected: PASS (동작 불변 → 기존 단언 그대로 통과).

- [ ] **Step 9: 커밋**

```bash
git add lib/types/bid.ts lib/server components/rfp/comparison
git commit -m "refactor(bid): paymentFees 값 number|TierRates union화 + 읽기 접근자 전환"
```

---

## Task 3: useBidDraft — `__v` 3 + 복합 키

draft `fees`를 구간 수단은 `"card:sole"`처럼 복합 키로 저장. 구버전 draft는 폐기.

**Files:**
- Modify: `components/inbox/useBidDraft.ts`
- Test: `components/inbox/__tests__/useBidDraft.test.ts` (기존 파일에 케이스 추가)

- [ ] **Step 1: 실패 테스트 추가**

`components/inbox/__tests__/useBidDraft.test.ts`에 추가:
```ts
  it('구버전 __v=2 draft는 폐기한다', () => {
    localStorage.setItem(
      'bid-draft:rfp-x',
      JSON.stringify({ __v: 2, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: { card: '1.2' }, memo: '' }),
    );
    const { result } = renderHook(() => useBidDraft('rfp-x'));
    expect(result.current.draft).toBeNull();
    expect(localStorage.getItem('bid-draft:rfp-x')).toBeNull();
  });

  it('__v=3 복합 키 draft를 복원한다', () => {
    localStorage.setItem(
      'bid-draft:rfp-y',
      JSON.stringify({ __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: { 'card:sole': '0.5', virtual_account: '0.3' }, memo: '' }),
    );
    const { result } = renderHook(() => useBidDraft('rfp-y'));
    expect(result.current.draft?.fees['card:sole']).toBe('0.5');
    expect(result.current.draft?.fees.virtual_account).toBe('0.3');
  });
```
(파일 상단에 `renderHook` import가 없으면 `import { renderHook } from '@testing-library/react';` 추가. 기존 케이스 패턴 따름.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/inbox/__tests__/useBidDraft.test.ts`
Expected: `__v=3 복원` 케이스 FAIL — readDraft가 `__v !== 2`라 폐기.

- [ ] **Step 3: 최소 구현**

`components/inbox/useBidDraft.ts`:
- `BidDraft.__v` 타입을 `3`으로:
  ```ts
  export type BidDraft = {
    __v: 3;
    ...
  ```
  주석도 갱신: `// __v 3: 카드·간편결제 구간화로 fees 키에 "<method>:<tier>" 복합 키 도입.`
- `readDraft`의 가드 `=== 2`를 `=== 3`으로:
  ```ts
      (parsed as { __v?: unknown }).__v !== 3 ||
  ```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/inbox/__tests__/useBidDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: BidWizard 초기 draft `__v` 갱신 (컴파일 유지)**

`components/inbox/bid-wizard/BidWizard.tsx:52` 초기 state `__v: 2` → `__v: 3`.

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS (또는 Task 5까지 보류되는 무관 실패 없음).

- [ ] **Step 6: 커밋**

```bash
git add components/inbox/useBidDraft.ts components/inbox/__tests__/useBidDraft.test.ts components/inbox/bid-wizard/BidWizard.tsx
git commit -m "feat(bid): draft __v 3 + 구간 복합 키 도입"
```

---

## Task 4: BidStepFees — 구간 매트릭스 입력 UI

요청수단을 카테고리로 분류해 카드·간편결제는 5구간 매트릭스, 계좌·기타·커스텀은 기존 단일 입력. 복합 키(`<method>:<tier>`)로 `onFee` 호출.

**Files:**
- Modify: `components/inbox/bid-wizard/BidStepFees.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx` 교체/추가:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BidStepFees } from '../BidStepFees';

const noop = () => {};

function setup(over: Partial<React.ComponentProps<typeof BidStepFees>> = {}) {
  const onFee = vi.fn();
  render(
    <BidStepFees
      feeInputMethods={['card', 'naver_pay', 'virtual_account']}
      customPaymentMethods={[]}
      fees={{}}
      onFee={onFee}
      onBack={noop}
      onNext={noop}
      {...over}
    />,
  );
  return { onFee };
}

describe('BidStepFees 구간 매트릭스', () => {
  it('카드·간편결제는 5구간 컬럼 헤더를 보여준다', () => {
    setup();
    expect(screen.getAllByText('영세').length).toBeGreaterThan(0);
    expect(screen.getAllByText('일반').length).toBeGreaterThan(0);
    expect(screen.getByText('카드')).toBeInTheDocument();
    expect(screen.getByText('네이버페이')).toBeInTheDocument();
  });

  it('계좌·기타는 구간 없이 단일 입력', () => {
    setup();
    // 가상계좌는 단일요율 라벨로 노출 (구간 헤더 행 밖)
    expect(screen.getByText(/가상계좌/)).toBeInTheDocument();
  });

  it('구간 셀 입력 시 "<method>:<tier>" 복합 키로 onFee 호출', () => {
    const { onFee } = setup();
    const cell = screen.getByTestId('fee-cell-card-sole');
    fireEvent.change(cell, { target: { value: '0.5' } });
    expect(onFee).toHaveBeenCalledWith('card:sole', '0.5');
  });

  it('요청 안 된 카드 카테고리 수단(해외카드)은 렌더하지 않는다', () => {
    setup();
    expect(screen.queryByText('해외카드')).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`
Expected: FAIL — `fee-cell-card-sole` testid 없음, 구간 헤더 없음.

- [ ] **Step 3: 구현 — BidStepFees 교체**

`components/inbox/bid-wizard/BidStepFees.tsx` 전체:
```tsx
'use client';

import { Button } from '@/components/primitives/Button';
import { PercentInput, numericInputClass } from '@/components/forms/inputs';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';

type Props = {
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  onFee: (key: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
};

const TIERED_LABELS: readonly string[] = ['카드', '간편결제'];

export function BidStepFees({
  feeInputMethods,
  customPaymentMethods,
  fees,
  onFee,
  onBack,
  onNext,
}: Props) {
  const requested = new Set(feeInputMethods);

  // 구간 카테고리(카드·간편결제)별로 요청된 수단 행 묶음
  const tieredGroups = PAYMENT_METHOD_CATEGORIES.filter((c) =>
    TIERED_LABELS.includes(c.label),
  )
    .map((c) => ({ label: c.label, methods: c.methods.filter((m) => requested.has(m)) }))
    .filter((g) => g.methods.length > 0);

  // 단일요율 수단(계좌·기타 등 비-구간 요청수단)
  const singleMethods = feeInputMethods.filter((m) => !isTieredMethod(m));

  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
  const tieredCellCount = tieredGroups.reduce((n, g) => n + g.methods.length * MERCHANT_TIERS.length, 0);
  const totalUnits = tieredCellCount + singleMethods.length + customPaymentMethods.length;
  const filledUnits =
    tieredGroups.reduce(
      (n, g) => n + g.methods.reduce((mm, m) => mm + MERCHANT_TIERS.filter((t) => feeFilled(`${m}:${t}`)).length, 0),
      0,
    ) +
    singleMethods.filter((m) => feeFilled(m)).length +
    customPaymentMethods.filter((c) => feeFilled(c.id)).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          카드·간편결제는 구간(영세~일반)별로 · 1칸 이상 입력하면 발송할 수 있어요
        </p>
        <span
          data-testid="fees-count"
          className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]"
        >
          {filledUnits}/{totalUnits}
        </span>
      </div>

      {tieredGroups.map((group) => (
        <div key={group.label} className="space-y-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            {group.label} · 구간별 우대수수료
          </span>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-[110px]" />
                {MERCHANT_TIERS.map((t) => (
                  <th
                    key={t}
                    className="text-center font-mono text-[10px] tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)] pb-1"
                  >
                    {MERCHANT_TIER_LABELS[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.methods.map((m) => (
                <tr key={m}>
                  <td className="text-[13px] text-[var(--md-sys-color-on-surface)] pr-2 py-1">
                    {PAYMENT_METHOD_LABELS[m]}
                  </td>
                  {MERCHANT_TIERS.map((t) => {
                    const key = `${m}:${t}`;
                    return (
                      <td key={t} className="px-0.5 py-1">
                        <input
                          data-testid={`fee-cell-${m}-${t}`}
                          inputMode="decimal"
                          value={fees[key] ?? ''}
                          onChange={(e) => onFee(key, e.target.value)}
                          className={numericInputClass}
                          aria-label={`${PAYMENT_METHOD_LABELS[m]} ${MERCHANT_TIER_LABELS[t]} 수수료`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {(singleMethods.length > 0 || customPaymentMethods.length > 0) && (
        <div className="space-y-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            계좌 · 기타 (단일요율)
          </span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {singleMethods.map((m) => (
              <PercentInput
                key={m}
                label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
                value={fees[m] ?? ''}
                onChange={(v) => onFee(m, v)}
              />
            ))}
            {customPaymentMethods.map((c) => (
              <PercentInput
                key={c.id}
                label={`${c.label} 수수료`}
                value={fees[c.id] ?? ''}
                onChange={(v) => onFee(c.id, v)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          정산 조건
        </Button>
        <Button type="button" onClick={onNext} trailingIcon={<span aria-hidden>→</span>}>
          견적서
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidStepFees.tsx components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx
git commit -m "feat(bid): BidStepFees 카드·간편결제 구간 매트릭스 입력"
```

---

## Task 5: BidWizard — 조립(buildPaymentFees)·anyFeeFilled·applyTemplate

복합 키 fees를 `number | TierRates`로 조립하고, 구간 셀 채움도 발송 가능 판정에 포함하고, 템플릿 적용 시 복합 키로 역전개.

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx` (케이스 추가)

- [ ] **Step 1: 실패 테스트 작성**

`BidWizard.test.tsx`에 추가(기존 submit 모킹 패턴 따름 — `submitBidAction` 모킹 후 호출 인자 검증):
```tsx
  it('구간 셀을 채워 발송하면 paymentFees가 구간맵으로 조립된다', async () => {
    const submit = vi.mocked(submitBidAction);
    submit.mockResolvedValue({ ok: true, bidId: 'b1' });
    render(<BidWizard rfp={rfpWith(['card', 'virtual_account'])} buyerName="구매사" />);

    // 정산주기 채우고 step2 이동 후 card:sole, virtual_account 입력
    // (헬퍼: 기존 테스트의 네비/입력 유틸 재사용)
    fillCycle('1');
    goStep(2);
    fireEvent.change(screen.getByTestId('fee-cell-card-sole'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByTestId('fee-cell-card-general'), { target: { value: '1.8' } });
    fireEvent.change(screen.getByLabelText(/가상계좌 수수료/), { target: { value: '0.3' } });
    goStep(4);
    fireEvent.click(screen.getByRole('button', { name: '견적 보내기' }));
    fireEvent.click(await screen.findByRole('button', { name: '견적 보내기' })); // confirm

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const arg = submit.mock.calls[0][0];
    expect(arg.paymentFees).toEqual({ card: { sole: 0.005, general: 0.018 }, virtual_account: 0.003 });
  });
```
> 주: 기존 `BidWizard.test.tsx`의 네비/입력 헬퍼(`fillCycle`/`goStep` 등) 명칭은 파일에 맞춰 조정. 헬퍼가 없으면 같은 방식으로 인라인 작성.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: FAIL — buildPaymentFees가 복합 키를 모르고 `card`를 NaN/누락.

- [ ] **Step 3: 구현**

`components/inbox/bid-wizard/BidWizard.tsx` import에 추가:
```ts
import {
  PAYMENT_METHOD_CATEGORIES,
  MERCHANT_TIERS,
  isTieredMethod,
  type PaymentMethod,
  type TierRates,
  type QuoteTemplateOption,
} from '@/lib/types/bid';
```
`buildPaymentFees`(119-126) 교체:
```ts
  const buildPaymentFees = (): Partial<Record<PaymentMethod, number | TierRates>> => {
    const out: Partial<Record<PaymentMethod, number | TierRates>> = {};
    for (const m of feeInputMethods) {
      if (isTieredMethod(m)) {
        const map: TierRates = {};
        for (const tier of MERCHANT_TIERS) {
          const v = fees[`${m}:${tier}`] ?? '';
          if (v !== '') map[tier] = pct(v);
        }
        if (Object.keys(map).length > 0) out[m] = map;
      } else {
        const v = fees[m] ?? '';
        if (v !== '') out[m] = pct(v);
      }
    }
    return out;
  };
```
`anyFeeFilled`(113-115) 교체:
```ts
  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
  const anyTieredFilled = feeInputMethods.some(
    (m) => isTieredMethod(m) && MERCHANT_TIERS.some((t) => feeFilled(`${m}:${t}`)),
  );
  const anySingleFilled =
    feeInputMethods.some((m) => !isTieredMethod(m) && feeFilled(m)) ||
    customPaymentMethods.some((c) => feeFilled(c.id));
  const anyFeeFilled = anyTieredFilled || anySingleFilled;
```
`applyTemplate`(128-142)의 fees 전개 루프 교체:
```ts
      const nextFees = { ...f.fees };
      for (const method of feeInputMethods) {
        const val = t.paymentFees[method];
        if (val === undefined) continue;
        if (typeof val === 'object') {
          for (const tier of MERCHANT_TIERS) {
            const r = val[tier];
            if (r !== undefined) nextFees[`${method}:${tier}`] = fmtPct(r);
          }
        } else if (isTieredMethod(method)) {
          // 구버전 단일요율 템플릿 → 전 구간 동일값으로 전개
          for (const tier of MERCHANT_TIERS) nextFees[`${method}:${tier}`] = fmtPct(val);
        } else {
          nextFees[method] = fmtPct(val);
        }
      }
```
(미사용 import 정리: 기존 `PAYMENT_METHOD_CATEGORIES`는 `ALL_PAYMENT_METHODS` 계산에 이미 쓰임 — 유지.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "feat(bid): wizard 구간맵 조립·발송판정·템플릿 역전개"
```

---

## Task 6: BidStepReview — 구간 요약 표시

검토 단계에서 구간 수단은 "영세~일반" 한 줄 요약, 단일 수단은 기존 행.

**Files:**
- Modify: `components/inbox/bid-wizard/BidStepReview.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx`

- [ ] **Step 1: 실패 테스트 추가**

```tsx
  it('구간 수단은 구간별 요율을 요약 표시한다', () => {
    render(
      <BidStepReview
        settleCycle="D+1" settleLimit="0" guaranteeInsurance="0"
        feeInputMethods={['card']} customPaymentMethods={[]}
        fees={{ 'card:sole': '0.5', 'card:general': '1.8' }}
        canSubmit pending={false} submitError={null}
        onBack={() => {}} onSubmit={() => {}} onSaveTemplate={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText('카드')).toBeInTheDocument();
    expect(screen.getByText(/영세/)).toBeInTheDocument();
    expect(screen.getByText(/0\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/1\.8%/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx`
Expected: FAIL — 현재 `feeRows`는 `fees['card']`(단일 키)만 봄 → 카드 행 없음.

- [ ] **Step 3: 구현**

`BidStepReview.tsx` import에 추가:
```ts
import { MERCHANT_TIERS, MERCHANT_TIER_LABELS, isTieredMethod, PAYMENT_METHOD_LABELS, ... } from '@/lib/types/bid';
```
`feeRows` 계산(69-76)을 구간 인지로 교체:
```ts
  const feeRows: [string, string][] = [];
  for (const m of feeInputMethods) {
    if (isTieredMethod(m)) {
      const parts = MERCHANT_TIERS
        .filter((t) => (fees[`${m}:${t}`] ?? '') !== '')
        .map((t) => `${MERCHANT_TIER_LABELS[t]} ${fees[`${m}:${t}`]}%`);
      if (parts.length > 0) feeRows.push([PAYMENT_METHOD_LABELS[m], parts.join(' · ')]);
    } else if ((fees[m] ?? '') !== '') {
      feeRows.push([PAYMENT_METHOD_LABELS[m], `${fees[m]}%`]);
    }
  }
  for (const c of customPaymentMethods) {
    if ((fees[c.id] ?? '') !== '') feeRows.push([c.label, `${fees[c.id]}%`]);
  }
```
(`Row` 컴포넌트는 value가 길어지므로 `value` span에 `whitespace-normal text-right` 정도만 보강 — 시각 변경, 테스트 무관.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidStepReview.tsx components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx
git commit -m "feat(bid): 검토 단계 구간 요율 요약 표시"
```

---

## Task 7: submit 액션 zod + 서비스 검증 — 구간맵 수용

`PaymentFeesSchema`가 각 수단 값으로 `number` 또는 구간 부분맵을 받게 하고, 서비스의 "요청외 수단 거부"가 맵 케이스에서도 동작함을 고정.

**Files:**
- Modify: `lib/server/actions/bid/submitBidAction.ts`
- Test: `lib/server/actions/bid/__tests__/submitBid.test.ts`, `lib/server/services/__tests__/bidSubmit.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`lib/server/actions/bid/__tests__/submitBid.test.ts`에 추가(기존 패턴: zod 통과 후 service 저장 검증):
```ts
  it('카드 구간맵을 그대로 저장한다', async () => {
    // ... 기존 셋업 재사용 (요청수단에 card 포함)
    const res = await submitBidAction({
      rfpId, settleCycle: 'D+1', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: { sole: 0.005, general: 0.018 } },
    });
    expect(res.ok).toBe(true);
    const row = await loadStoredBid(); // 기존 헬퍼
    expect((row.n as { card?: unknown }).card).toEqual({ sole: 0.005, general: 0.018 });
  });

  it('잘못된 구간 키는 거부한다', async () => {
    const res = await submitBidAction({
      rfpId, settleCycle: 'D+1', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: { bogus: 0.1 } as never },
    });
    expect(res.ok).toBe(false);
  });
```
> `loadStoredBid`/셋업 명칭은 기존 파일에 맞춰 사용. `n`은 기존 테스트의 paymentFees 컬럼 별칭.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/server/actions/bid/__tests__/submitBid.test.ts`
Expected: 첫 케이스 FAIL — 현재 `feeField`는 number만 → `.strict()` object가 구간맵 거부(INVALID_INPUT).

- [ ] **Step 3: 구현 — zod union**

`submitBidAction.ts` 교체:
```ts
const rate = z.number().min(0).max(1);
const tierMap = z
  .object({
    sole: rate.optional(),
    sme1: rate.optional(),
    sme2: rate.optional(),
    sme3: rate.optional(),
    general: rate.optional(),
  })
  .strict();
const feeField = z.union([rate, tierMap]).optional();

const PaymentFeesSchema = z
  .object({
    card: feeField,
    overseas_card: feeField,
    virtual_account: feeField,
    bank_transfer: feeField,
    naver_pay: feeField,
    kakao_pay: feeField,
    toss_pay: feeField,
    mobile: feeField,
    gift_card: feeField,
  })
  .strict();
```
(`paymentFees` 캐스트는 Task 2 Step 4에서 이미 union.)

- [ ] **Step 4: 통과 확인 — 액션 + 서비스**

Run: `pnpm test lib/server/actions/bid/__tests__/submitBid.test.ts lib/server/services/__tests__/bidSubmit.test.ts lib/server/services/__tests__/bid.test.ts`
Expected: PASS. (서비스 요청외 수단 검증은 키 기반이라 변경 없이 그린 — 필요 시 맵 입력 케이스를 `bidSubmit.test.ts`에 1개 추가해 "요청 안 된 수단 맵 거부" 고정.)

- [ ] **Step 5: 커밋**

```bash
git add lib/server/actions/bid/submitBidAction.ts lib/server/actions/bid/__tests__/submitBid.test.ts lib/server/services/__tests__
git commit -m "feat(bid): submit zod가 구간맵 수용 + 검증 고정"
```

---

## Task 8: 구매사 비교 — 구간 셀렉터

`FocusComparison`에 구간 세그먼트(기본 일반)를 추가하고, 정렬·feeRows·peek·ImprovementSummary가 선택 구간을 사용.

**Files:**
- Modify: `components/rfp/comparison/FocusComparison.tsx`
- Test: `components/rfp/comparison/__tests__/FocusComparison.test.tsx`

- [ ] **Step 1: 실패 테스트 추가**

```tsx
  it('구간 셀렉터를 바꾸면 카드 요율 표시가 그 구간 값으로 바뀐다', () => {
    const bids = [
      mkBid({ id: 'a', pgWsId: 'pgA', paymentFees: { card: { sole: 0.005, general: 0.018 } } }),
    ];
    render(<FocusComparison {...baseProps} bids={bids} requiredPaymentMethods={['card']} />);
    // 기본 일반 → 1.8%
    expect(screen.getByText('1.80%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '영세' }));
    expect(screen.getByText('0.50%')).toBeInTheDocument();
  });

  it('구버전 number bid는 구간 무관 동일 값', () => {
    const bids = [mkBid({ id: 'a', pgWsId: 'pgA', paymentFees: { card: 0.012 } })];
    render(<FocusComparison {...baseProps} bids={bids} requiredPaymentMethods={['card']} />);
    fireEvent.click(screen.getByRole('button', { name: '영세' }));
    expect(screen.getByText('1.20%')).toBeInTheDocument();
  });
```
> `mkBid`/`baseProps`는 기존 테스트 헬퍼. `paymentFees`에 구간맵을 넣을 수 있도록 헬퍼 타입을 넓힌다(이미 Bid 타입이 union).

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/rfp/comparison/__tests__/FocusComparison.test.tsx`
Expected: FAIL — 셀렉터 버튼('영세') 없음, tier='general' 고정.

- [ ] **Step 3: 구현 — 셀렉터 상태 + 전파**

`FocusComparison.tsx` import에 추가:
```ts
import { MERCHANT_TIERS, MERCHANT_TIER_LABELS, type MerchantTier, getMethodRate, ... } from '@/lib/types/bid';
```
컴포넌트 상단(다른 useState 곁)에:
```ts
  const [tier, setTier] = useState<MerchantTier>('general');
```
Task 2에서 `'general'`로 고정했던 3곳(`sortedBids` 정렬, `feeRows` getValue, peek 카드)을 `tier`로 치환. 단 `sortedBids`의 `useMemo` deps에 `tier` 추가:
```ts
  const sortedBids = useMemo(
    () =>
      [...bids].sort(
        (a, b) =>
          (getMethodRate(a.paymentFees.card, tier) ?? Infinity) -
          (getMethodRate(b.paymentFees.card, tier) ?? Infinity),
      ),
    [bids, tier],
  );
```
`ImprovementSummary`에 tier 전달:
```tsx
        <ImprovementSummary bid={active} current={current} tier={tier} />
```
"견적 비교" 헤더 줄(98-106) 우측 "정렬: 카드 수수료 낮은 순" 옆/아래에 세그먼트 추가:
```tsx
      <div role="group" aria-label="구간 선택" className="flex gap-1 mb-3">
        {MERCHANT_TIERS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tier === t}
            onClick={() => setTier(t)}
            className={cn(
              'h-7 px-2.5 rounded-[6px] text-[12px] transition-colors',
              tier === t
                ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]',
            )}
          >
            {MERCHANT_TIER_LABELS[t]}
          </button>
        ))}
      </div>
```
(계좌·기타 단일 수단 행은 `getMethodRate(number, tier)`가 항상 같은 값을 돌려주므로 셀렉터와 무관하게 동일 표시 — 자동.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/rfp/comparison/__tests__/FocusComparison.test.tsx components/rfp/comparison/__tests__/ImprovementSummary.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/comparison/FocusComparison.tsx components/rfp/comparison/ImprovementSummary.tsx components/rfp/comparison/__tests__
git commit -m "feat(rfp): 비교 화면 구간 셀렉터(기본 일반)"
```

---

## Task 9: 구매사 상세 — 활성 견적 읽기전용 구간 매트릭스

비교의 "전체 결제수단 요율" 아코디언에, 활성 PG의 구간 수단을 5×N 읽기전용 매트릭스로 추가(선택 구간 비교는 기존 행 유지).

**Files:**
- Modify: `components/rfp/comparison/FocusComparison.tsx`
- Test: `components/rfp/comparison/__tests__/FocusComparison.test.tsx`

- [ ] **Step 1: 실패 테스트 추가**

```tsx
  it('상세 매트릭스에 활성 견적의 전 구간 카드 요율이 보인다', () => {
    const bids = [mkBid({ id: 'a', pgWsId: 'pgA', paymentFees: { card: { sole: 0.005, sme1: 0.01, sme2: 0.0125, sme3: 0.0145, general: 0.018 } } })];
    render(<FocusComparison {...baseProps} bids={bids} requiredPaymentMethods={['card']} />);
    const matrix = screen.getByTestId('tiered-matrix-card');
    expect(matrix).toHaveTextContent('0.50%');
    expect(matrix).toHaveTextContent('1.80%');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/rfp/comparison/__tests__/FocusComparison.test.tsx`
Expected: FAIL — `tiered-matrix-card` 없음.

- [ ] **Step 3: 구현 — 아코디언 내 매트릭스 블록**

`FocusComparison.tsx`의 `AccordionItem value="rates"` 안, 기존 `feeRows.map(...)` div **위**에 추가:
```tsx
              {(Object.keys(active.paymentFees) as PaymentMethod[])
                .filter((m) => typeof active.paymentFees[m] === 'object')
                .map((m) => (
                  <table key={m} data-testid={`tiered-matrix-${m}`} className="w-full mb-3 border-collapse">
                    <caption className="text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] mb-1">
                      {PAYMENT_METHOD_LABELS[m]} · 구간별
                    </caption>
                    <thead>
                      <tr>
                        {MERCHANT_TIERS.map((t) => (
                          <th key={t} className="text-center font-mono text-[10px] text-[var(--md-sys-color-outline)] pb-0.5">
                            {MERCHANT_TIER_LABELS[t]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {MERCHANT_TIERS.map((t) => {
                          const r = getMethodRate(active.paymentFees[m], t);
                          return (
                            <td key={t} className="text-center md-numeric text-[12px] text-[var(--md-sys-color-on-surface)] py-0.5">
                              {r !== undefined ? formatPct(r) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                ))}
```
(아코디언 타이틀의 `feeRows.length` 카운트는 그대로 두되, 매트릭스는 선택 구간 비교 행과 함께 같은 패널에 표시 — 한 PG의 전 구간 한눈에.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/rfp/comparison/__tests__/FocusComparison.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/comparison/FocusComparison.tsx components/rfp/comparison/__tests__/FocusComparison.test.tsx
git commit -m "feat(rfp): 견적 상세 구간 요율 읽기전용 매트릭스"
```

---

## Task 10: 견적 템플릿 — 구간 저장/적용

`saveQuoteTemplateAction`의 zod를 submit과 동일 union으로 확장. 적용(역전개)은 Task 5에서 완료. 패널 미리보기 표기 보강.

**Files:**
- Modify: `lib/server/actions/quote-template/saveQuoteTemplateAction.ts`
- Modify: `components/settings/QuoteTemplatesPanel.tsx` (미리보기 표기)
- Test: `lib/server/actions/quote-template/__tests__/*.test.ts` (해당 파일), `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`(라운드트립)

- [ ] **Step 1: 실패 테스트 추가**

템플릿 저장 액션 테스트(기존 디렉터리)에:
```ts
  it('구간맵 paymentFees 템플릿을 저장한다', async () => {
    const res = await saveQuoteTemplateAction({
      name: '표준요율', settleCycle: 'D+1', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: { sole: 0.005, general: 0.018 } },
    });
    expect(res.ok).toBe(true);
    const saved = await loadTemplate(res.templateId); // 기존 헬퍼
    expect(saved.paymentFees.card).toEqual({ sole: 0.005, general: 0.018 });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/server/actions/quote-template`
Expected: FAIL — `feeField`(number) → strict object가 구간맵 거부.

- [ ] **Step 3: 구현 — zod union**

`saveQuoteTemplateAction.ts`의 `feeField`/`PaymentFeesSchema`를 Task 7 Step 3과 동일 형태로 교체(rate+tierMap union):
```ts
const rate = z.number().min(0).max(1);
const tierMap = z
  .object({ sole: rate.optional(), sme1: rate.optional(), sme2: rate.optional(), sme3: rate.optional(), general: rate.optional() })
  .strict();
const feeField = z.union([rate, tierMap]).optional();
```
(`PaymentFeesSchema` object 본문은 동일.) repo 저장은 JSONB 그대로 — 변경 없음.

- [ ] **Step 4: 통과 확인 + 라운드트립**

Run: `pnpm test lib/server/actions/quote-template components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS. (BidWizard `applyTemplate` 역전개는 Task 5에서 구현됨 — 구간맵 템플릿 적용 시 매트릭스 채움 케이스 1개 추가해 고정.)

- [ ] **Step 5: 패널 미리보기 보강**

`components/settings/QuoteTemplatesPanel.tsx`에서 paymentFees 미리보기가 `number`만 가정해 `.toFixed`/포맷하면 런타임/타입 에러. 구간 수단은 "구간별" 뱃지로 단순화:
```tsx
// 각 method 값 v 표시부:
{typeof v === 'object' ? '구간별' : `${(v * 100).toFixed(2)}%`}
```
(정확한 위치는 기존 렌더 루프. 값 타입 `number | TierRates` 가드.)

- [ ] **Step 6: 통과 확인**

Run: `pnpm test components/settings`
Expected: PASS (또는 패널 테스트 없으면 tsc로 대체 확인).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/actions/quote-template components/settings/QuoteTemplatesPanel.tsx lib/server/actions/quote-template/__tests__ components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "feat(quote-template): 구간맵 저장/적용/미리보기"
```

---

## Task 11: 전체 헬스 + 정리

**Files:** 없음(검증 only)

- [ ] **Step 1: 타입체크**

Run: `pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"`
Expected: 신규 에러 0 (clean HEAD의 wizard test globals 잔여만 — [[typecheck-red-wizard-test-globals]]).

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: 0 errors. (RTK no-var disable 디렉티브는 유지 — [[rtk-lint-false-positive]].)

- [ ] **Step 3: 전체 유닛**

Run: `pnpm test`
Expected: 전부 green. (느려지면 한 번에 하나씩 — [[full-suite-slow-swap-thrash]].)

- [ ] **Step 4: (선택) e2e scenario-b — PG 견적 작성 플로우**

Run: `docker compose --profile test up -d pg-test && pnpm e2e tests/e2e/scenario-b* > /tmp/e2e.log 2>&1; tail -5 /tmp/e2e.log`
Expected: PASS. 구간 매트릭스 입력으로 셀렉터/제출이 깨지지 않는지 확인. 셀렉터가 바뀌었으면 스펙 픽스(테스트 우선). ([[e2e-blockers-seed-and-staletests]])

- [ ] **Step 5: 최종 커밋(있으면) + /ship 준비**

```bash
git add -A && git commit -m "chore(bid): 구간 수수료 헬스 통과" --allow-empty
```
이후 `/ship`으로 PR.

---

## Self-Review 체크리스트 (작성자 확인 완료)

- **스펙 커버리지:** 데이터모델(T1·T2), PG 입력 draft/매트릭스/조립/검토(T3·T4·T5·T6), 서버 검증(T7), 구매사 비교 셀렉터(T8)·상세 매트릭스(T9), 템플릿(T10) — 스펙 8개 확정결정·블래스트표 전 항목에 대응 Task 존재.
- **하위호환:** `getMethodRate`가 number를 모든 구간에 반환 → 구 데이터/구 템플릿 안전(T1·T2·T5·T8 테스트로 고정).
- **타입 일관성:** `number | TierRates` 한 union을 Bid·QuoteTemplate·service·zod 전부 동일 사용. 복합 키 포맷 `\`${method}:${tier}\``를 draft·BidStepFees·buildPaymentFees·applyTemplate·BidStepReview에서 일관 사용.
- **placeholder 없음:** 모든 코드 스텝에 실제 코드. (기존 테스트 헬퍼 명칭만 "파일에 맞춰 조정" — 헬퍼는 해당 테스트 파일에 이미 존재.)
- **DB:** DDL/마이그레이션 없음(JSONB). 라우트·RFP 작성 화면 불변.
