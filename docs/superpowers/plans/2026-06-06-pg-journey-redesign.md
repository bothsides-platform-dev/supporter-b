# PG 여정 UI/UX 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG(결제대행사) 여정을 "한 화면 = 하나만 강조" 원칙으로 재설계한다 — 견적 작성을 4단계 위저드로 전환하고, 목록·완료 화면을 원칙에 맞게 정돈한다.

**Architecture:** 핵심 변경은 `BidForm`(592줄 단일 폼)을 구매사 `RfpCreateWizard`와 대칭인 **단계형 위저드**로 분해하는 것이다. 기존 제출/검증/초안/템플릿 로직은 그대로 옮기고(신규 비즈니스 로직 없음), 4개 표현형 step 컴포넌트 + 컨텍스트 strip + 컨테이너로 나눈다. 공유 위저드 사이드바/진행바는 `steps`·`title` prop을 추가해 일반화한다(구매사 동작은 기본값으로 보존). 목록·완료 화면은 마크업/위계만 정돈한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4(`--md-sys-*` 토큰), Vitest + React Testing Library(jsdom). 설계 문서: `docs/superpowers/specs/2026-06-06-pg-journey-redesign-design.md`.

**전제(설계 문서 §2.2):** 위저드는 단계 자유 점프·키보드 이동·초안 자동저장을 유지해 파워유저 속도를 깎지 않는다. 구매사 위저드(`RfpCreateWizard`)를 멘탈모델·구조의 기준으로 미러링한다.

**TDD:** 본 레포는 TDD 하드룰 적용. 모든 task는 RED(실패 테스트 확인) → GREEN(최소 구현) → 커밋. 순수 함수는 단위 테스트, 표현형 컴포넌트는 RTL 렌더 + 핵심 동작 검증.

**실행 환경 메모:**
- 단일 테스트 파일 실행: `pnpm test <path>` (RED/GREEN은 항상 단일 파일로 빠르게 확인).
- jsdom localStorage 이슈 회피가 필요하면(메모리: node26 트랩) `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test ...`.
- cmdk/`@base-ui` 컴포넌트 렌더 테스트는 `ResizeObserver` stub 필요(기존 `BidForm.test.tsx` 패턴 참고).
- 작업은 worktree 브랜치에서 진행(`fix`/`feat` 슬러그). dev는 clean 유지.

---

## File Structure

**신규 (`components/inbox/bid-wizard/`)**
- `bid-wizard-steps.ts` — `BID_WIZARD_STEPS` 상수(4단계 라벨).
- `bid-wizard-validation.ts` — `getBidWizardValidity` / `getFirstIncompleteBidStep` (순수 함수, 단위 테스트 대상).
- `types.ts` — `SetBidField` 공유 타입.
- `BidStepSettlement.tsx` — 1단계: 정산 조건(정산주기·정산한도·월보증보험).
- `BidStepFees.tsx` — 2단계: 요청 결제수단별 수수료율 그리드.
- `BidStepProposal.tsx` — 3단계: 견적서 PDF 업로드 + 메모.
- `BidStepReview.tsx` — 4단계: 요약 + 비가역 경고 + 템플릿 저장 + 발송 버튼.
- `BidContextStrip.tsx` — 상단 얇은 컨텍스트 strip + '요청 전문 ▾' 펼침(RfpBriefPanel 래핑).
- `BidWizard.tsx` — 컨테이너(상태·자동저장·템플릿·제출·단계 이동 오케스트레이션).

**수정**
- `components/rfp/WizardStepSidebar.tsx` — `steps?`·`title?` prop 추가(기본값 = 기존 구매사 값).
- `components/rfp/WizardProgressBar.tsx` — `steps?` prop 추가(기본값 = `WIZARD_STEPS`).
- `components/inbox/PgRfpDetailContent.tsx` — 미제출 분기를 2-col → `BidWizard` 풀폭으로 교체 + Skeleton 갱신.
- `components/opportunities/OpportunityList.tsx` — 행 위계 정돈(1·2차 라인) + 마감 D-n 칩.
- `components/inbox/InboxList.tsx` — 상태 칩 강조 + 행당 1차 행동 + 마감 D-n 칩.
- `components/inbox/PgRfpDetailContent.tsx` — `variant: 'peek' | 'full'` 분기(peek=브리프+CTA, full=위저드). **두 렌더 컨텍스트**(전체 페이지 + InboxPeekPanel 오버레이) 때문에 필수.
- `app/(app)/inbox/[rfpId]/page.tsx` — 호출부에 `variant="full"` 전달(peek 호출부 InboxPeekPanel은 기본 'peek' 유지).
- `app/(app)/inbox/[rfpId]/submitted/page.tsx` — 메시지 지배 + 요약 접힘(`SubmittedSummary` 사용).
- `components/inbox/SubmittedSummary.tsx` — (신규) 접히는 견적 요약 클라이언트 컴포넌트.

**삭제 (마지막 단계, 위저드 GREEN 이후)**
- `components/inbox/BidForm.tsx` 및 `components/inbox/__tests__/BidForm.test.tsx` — 위저드로 대체. 핵심 테스트는 위저드 테스트로 이관.

---

## Phase 1 — 위저드 기반 (상수 · 검증 · 공유 컴포넌트 일반화)

### Task 1: 단계 상수 + 검증 순수 함수

**Files:**
- Create: `components/inbox/bid-wizard/bid-wizard-steps.ts`
- Create: `components/inbox/bid-wizard/bid-wizard-validation.ts`
- Test: `components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts
import { describe, it, expect } from 'vitest';
import {
  getBidWizardValidity,
  getFirstIncompleteBidStep,
} from '../bid-wizard-validation';

describe('getBidWizardValidity', () => {
  it('정산주기 미입력 + 수수료 없음 → 1·2단계 미완료, 3·4단계 완료', () => {
    const v = getBidWizardValidity({ cycleNum: '', anyFeeFilled: false });
    expect(v.map((s) => s.complete)).toEqual([false, false, true, true]);
  });

  it('정산주기 입력 + 수수료 1개 이상 → 전부 완료', () => {
    const v = getBidWizardValidity({ cycleNum: '1', anyFeeFilled: true });
    expect(v.map((s) => s.complete)).toEqual([true, true, true, true]);
  });

  it('cycleNum 0 은 1단계 미완료', () => {
    const v = getBidWizardValidity({ cycleNum: '0', anyFeeFilled: true });
    expect(v[0].complete).toBe(false);
  });
});

describe('getFirstIncompleteBidStep', () => {
  it('정산주기 미입력 시 1단계와 힌트 반환', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '', anyFeeFilled: true });
    expect(s?.num).toBe(1);
    expect(s?.hint).toContain('정산');
  });

  it('정산주기만 있고 수수료 없으면 2단계 반환', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '1', anyFeeFilled: false });
    expect(s?.num).toBe(2);
  });

  it('모두 충족 시 null', () => {
    expect(getFirstIncompleteBidStep({ cycleNum: '1', anyFeeFilled: true })).toBeNull();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts`
Expected: FAIL — `Cannot find module '../bid-wizard-validation'`.

- [ ] **Step 3: 상수 작성**

```ts
// components/inbox/bid-wizard/bid-wizard-steps.ts
export const BID_WIZARD_STEPS = [
  { num: 1, label: '정산 조건' },
  { num: 2, label: '수수료' },
  { num: 3, label: '견적서' },
  { num: 4, label: '검토·발송' },
] as const;

export type BidWizardStep = (typeof BID_WIZARD_STEPS)[number];
```

- [ ] **Step 4: 검증 함수 작성(최소 구현)**

```ts
// components/inbox/bid-wizard/bid-wizard-validation.ts
//
// 견적 작성 wizard 단일 검증 소스. 구매사 wizard-validation.ts 미러.
// step1=정산주기, step2=수수료1개+. step3(견적서)·step4(검토)는 선택/요약이라 항상 complete.
import { BID_WIZARD_STEPS } from './bid-wizard-steps';

export type BidValidationInput = {
  cycleNum: string;
  anyFeeFilled: boolean;
};

export type BidStepValidity = { num: number; complete: boolean; hint: string };

const HINTS: Record<number, string> = {
  1: '정산 주기를 입력해주세요',
  2: '수수료를 1개 이상 입력해주세요',
};

function isStepComplete(num: number, input: BidValidationInput): boolean {
  switch (num) {
    case 1:
      return input.cycleNum !== '' && parseInt(input.cycleNum) > 0;
    case 2:
      return input.anyFeeFilled;
    default:
      return true;
  }
}

export function getBidWizardValidity(input: BidValidationInput): BidStepValidity[] {
  return BID_WIZARD_STEPS.map(({ num }) => ({
    num,
    complete: isStepComplete(num, input),
    hint: HINTS[num] ?? '',
  }));
}

export function getFirstIncompleteBidStep(
  input: BidValidationInput,
): BidStepValidity | null {
  return getBidWizardValidity(input).find((s) => !s.complete) ?? null;
}
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts`
Expected: PASS (3 + 3).

- [ ] **Step 6: 커밋**

```bash
git add components/inbox/bid-wizard/bid-wizard-steps.ts components/inbox/bid-wizard/bid-wizard-validation.ts components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts
git commit -m "feat(bid-wizard): 단계 상수 + 검증 순수 함수"
```

---

### Task 2: `WizardStepSidebar` 일반화 (`steps`·`title` prop)

**Files:**
- Modify: `components/rfp/WizardStepSidebar.tsx`
- Test: `components/rfp/__tests__/WizardStepSidebar.test.tsx`

- [ ] **Step 1: 실패 테스트 작성** — 커스텀 steps/title 렌더 + 기존 기본값 보존.

```tsx
// components/rfp/__tests__/WizardStepSidebar.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WizardStepSidebar } from '../WizardStepSidebar';

afterEach(cleanup);

describe('WizardStepSidebar', () => {
  it('기본값: 구매사 단계 라벨 + 제목을 렌더', () => {
    render(<WizardStepSidebar currentStep={1} completed={[false, false, false, false]} onStepClick={vi.fn()} />);
    expect(screen.getByText('새 견적 요청')).toBeInTheDocument();
    expect(screen.getByText('사업자 확인')).toBeInTheDocument();
  });

  it('steps·title prop으로 견적 작성 단계를 렌더', () => {
    render(
      <WizardStepSidebar
        currentStep={2}
        completed={[true, false, false, false]}
        onStepClick={vi.fn()}
        steps={[
          { num: 1, label: '정산 조건' },
          { num: 2, label: '수수료' },
        ]}
        title="견적 작성"
      />,
    );
    expect(screen.getByText('견적 작성')).toBeInTheDocument();
    expect(screen.getByText('수수료')).toBeInTheDocument();
    expect(screen.queryByText('사업자 확인')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/rfp/__tests__/WizardStepSidebar.test.tsx`
Expected: FAIL — 두 번째 테스트가 '견적 작성'을 못 찾음(제목이 하드코딩 '새 견적 요청').

- [ ] **Step 3: 구현 — prop 추가, 기본값 보존**

`components/rfp/WizardStepSidebar.tsx` 의 props 타입과 함수 시그니처를 다음으로 교체:

```tsx
import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from './wizard-steps';

type WizardStepSidebarProps = {
  currentStep: number;
  completed: boolean[];
  onStepClick: (step: number) => void;
  /** 단계 정의 — 기본값은 구매사 RFP 작성 단계. */
  steps?: readonly { num: number; label: string }[];
  /** 사이드바 상단 제목 — 기본값은 구매사 플로우. */
  title?: string;
  /** 사이드바 하단 슬롯 — 견적 위저드의 '자동저장' 표시 등(기본 없음). */
  footer?: React.ReactNode;
};

export function WizardStepSidebar({
  currentStep,
  completed,
  onStepClick,
  steps = WIZARD_STEPS,
  title = '새 견적 요청',
  footer,
}: WizardStepSidebarProps) {
```

그리고:
- 본문에서 제목 span 텍스트를 `{title}` 로, `WIZARD_STEPS.map(...)` 를 `steps.map(...)` 로 교체.
- `steps.map(...)` 블록을 닫는 `</...>` 직전(`</nav>` 안 마지막)에 footer 슬롯 추가:

```tsx
      {footer && <div className="mt-auto pt-4">{footer}</div>}
```

(나머지 마크업/클래스는 그대로. `React.ReactNode` 사용을 위해 파일에 별도 import 불필요 — 전역 `React` 네임스페이스 타입은 TS에서 사용 가능하나, 안전을 위해 상단에 `import type { ReactNode } from 'react';` 추가하고 타입을 `ReactNode` 로 써도 됨.)

- [ ] **Step 4: GREEN 확인 + 구매사 위저드 회귀 확인**

Run: `pnpm test components/rfp/__tests__/WizardStepSidebar.test.tsx`
Expected: PASS (2).
Run: `pnpm test components/rfp/__tests__/RfpCreateWizard.test.tsx` (존재 시)
Expected: PASS — 기본값으로 동작 불변.

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/WizardStepSidebar.tsx components/rfp/__tests__/WizardStepSidebar.test.tsx
git commit -m "refactor(wizard): WizardStepSidebar steps·title prop 일반화"
```

---

### Task 3: `WizardProgressBar` 일반화 (`steps` prop)

**Files:**
- Modify: `components/rfp/WizardProgressBar.tsx`
- Test: `components/rfp/__tests__/WizardProgressBar.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/rfp/__tests__/WizardProgressBar.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WizardProgressBar } from '../WizardProgressBar';

afterEach(cleanup);

describe('WizardProgressBar', () => {
  it('기본값: 4단계 dot + 구매사 라벨', () => {
    render(<WizardProgressBar currentStep={1} completed={[false, false, false, false]} onStepClick={vi.fn()} />);
    expect(screen.getAllByTestId('progress-dot')).toHaveLength(4);
    expect(screen.getByText(/사업자 확인/)).toBeInTheDocument();
  });

  it('steps prop: 단계 수·라벨이 바뀐다', () => {
    render(
      <WizardProgressBar
        currentStep={2}
        completed={[true, false, false, false]}
        onStepClick={vi.fn()}
        steps={[
          { num: 1, label: '정산 조건' },
          { num: 2, label: '수수료' },
          { num: 3, label: '견적서' },
          { num: 4, label: '검토·발송' },
        ]}
      />,
    );
    expect(screen.getByText(/검토·발송/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/rfp/__tests__/WizardProgressBar.test.tsx`
Expected: FAIL — 두 번째 테스트가 '검토·발송' 못 찾음.

- [ ] **Step 3: 구현 — prop 추가, 라벨을 steps에서 도출**

`components/rfp/WizardProgressBar.tsx` 상단 import/타입/시그니처를 교체:

```tsx
import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from './wizard-steps';

type WizardProgressBarProps = {
  currentStep: number; // 1-N
  completed: boolean[];
  onStepClick?: (step: number) => void;
  /** 단계 정의 — 기본값은 구매사 RFP 작성 단계. */
  steps?: readonly { num: number; label: string }[];
};

export function WizardProgressBar({
  currentStep,
  completed,
  onStepClick,
  steps = WIZARD_STEPS,
}: WizardProgressBarProps) {
  const TOTAL = steps.length;
  const labels = steps.map((s) => s.label);
```

본문에서 `STEP_LABELS[...]` 를 `labels[...]` 로, 모듈 상수 `TOTAL`(기존 `WIZARD_STEPS.length`) 사용처를 위 지역 `TOTAL` 로 교체. (기존 모듈 레벨 `const TOTAL = WIZARD_STEPS.length;` 줄은 제거.)

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/rfp/__tests__/WizardProgressBar.test.tsx`
Expected: PASS (2).

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/WizardProgressBar.tsx components/rfp/__tests__/WizardProgressBar.test.tsx
git commit -m "refactor(wizard): WizardProgressBar steps prop 일반화"
```

---

## Phase 2 — Step 컴포넌트 (표현형)

### Task 4: 공유 타입

**Files:**
- Create: `components/inbox/bid-wizard/types.ts`

- [ ] **Step 1: 작성** (설정 성격 — 단독 테스트 불필요; Task 5에서 사용처가 컴파일 검증)

```ts
// components/inbox/bid-wizard/types.ts
import type { BidDraft } from '../useBidDraft';

export type SetBidField = <K extends keyof BidDraft>(key: K, value: BidDraft[K]) => void;
```

- [ ] **Step 2: 커밋**

```bash
git add components/inbox/bid-wizard/types.ts
git commit -m "feat(bid-wizard): SetBidField 공유 타입"
```

---

### Task 5: `BidStepSettlement` (1단계)

기존 `BidForm.tsx` 392–439줄(01 정산 조건)을 표현형 컴포넌트로 이관. 발 footer(다음 →)를 추가.

**Files:**
- Create: `components/inbox/bid-wizard/BidStepSettlement.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidStepSettlement } from '../BidStepSettlement';

afterEach(cleanup);

function renderStep(over: Partial<React.ComponentProps<typeof BidStepSettlement>> = {}) {
  const onField = vi.fn();
  const onNext = vi.fn();
  render(
    <BidStepSettlement
      cycleUnit="D"
      cycleNum="1"
      settleLimit="0"
      guaranteeInsurance="0"
      onField={onField}
      onNext={onNext}
      {...over}
    />,
  );
  return { onField, onNext };
}

describe('BidStepSettlement', () => {
  it('정산주기 숫자 입력 시 onField(cycleNum) 호출', async () => {
    const user = userEvent.setup();
    const { onField } = renderStep({ cycleNum: '' });
    await user.type(screen.getByPlaceholderText('1'), '2');
    expect(onField).toHaveBeenCalledWith('cycleNum', '2');
  });

  it('다음 버튼 클릭 시 onNext 호출', async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep();
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** (마크업은 BidForm 01 섹션 이관 + footer)

```tsx
// components/inbox/bid-wizard/BidStepSettlement.tsx
'use client';

import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { InfoTip } from '@/components/ui/info-tip';
import { Button } from '@/components/primitives/Button';
import { CurrencyInput, numericInputClass } from '@/components/forms/inputs';
import { cn } from '@/lib/utils';
import type { SetBidField } from './types';

const CYCLE_UNITS = [
  { value: 'D', label: 'D+' },
  { value: 'W', label: 'W+' },
  { value: 'M', label: 'M+' },
] as const;

type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  onField: SetBidField;
  onNext: () => void;
};

export function BidStepSettlement({
  cycleUnit,
  cycleNum,
  settleLimit,
  guaranteeInsurance,
  onField,
  onNext,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <div className="col-span-2 space-y-1">
          <div className="flex items-center gap-1">
            <Label size="md" muted={false}>정산 주기 *</Label>
            <InfoTip term="정산주기" />
          </div>
          <div className="flex items-end gap-2">
            <div className="w-28">
              <Select
                options={CYCLE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                value={cycleUnit}
                onChange={(v) => onField('cycleUnit', v as 'D' | 'W' | 'M')}
              />
            </div>
            <input
              type="number"
              min="1"
              max="99"
              value={cycleNum}
              onChange={(e) => onField('cycleNum', e.target.value)}
              placeholder="1"
              className={cn(numericInputClass, 'flex-1')}
            />
          </div>
          <p className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
            예: D+1, W+2, M+1
          </p>
        </div>
        <CurrencyInput label="정산한도 (원/월)" infoTerm="정산한도" value={settleLimit} onChange={(v) => onField('settleLimit', v)} placeholder="0" />
        <CurrencyInput label="월 보증보험 (원/연)" infoTerm="보증보험" value={guaranteeInsurance} onChange={(v) => onField('guaranteeInsurance', v)} placeholder="0" />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onNext} trailingIcon={<span aria-hidden>→</span>}>
          수수료
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx`
Expected: PASS (2).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidStepSettlement.tsx components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx
git commit -m "feat(bid-wizard): 1단계 정산 조건 컴포넌트"
```

---

### Task 6: `BidStepFees` (2단계)

기존 `BidForm.tsx` 441–474줄(02 수수료)을 이관. 카드 그리드 + 채움 카운터 + 발 footer(이전/다음).

**Files:**
- Create: `components/inbox/bid-wizard/BidStepFees.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidStepFees } from '../BidStepFees';
import type { PaymentMethod } from '@/lib/types/bid';

afterEach(cleanup);

const methods: PaymentMethod[] = ['card', 'bank'];

function renderStep(over: Partial<React.ComponentProps<typeof BidStepFees>> = {}) {
  const onFee = vi.fn();
  render(
    <BidStepFees
      feeInputMethods={methods}
      customPaymentMethods={[]}
      fees={{}}
      onFee={onFee}
      onBack={vi.fn()}
      onNext={vi.fn()}
      {...over}
    />,
  );
  return { onFee };
}

describe('BidStepFees', () => {
  it('요청된 결제수단 수만큼 수수료 입력칸 렌더', () => {
    renderStep();
    // PercentInput label "카드 수수료" / "계좌이체 수수료"
    expect(screen.getByText(/카드 수수료/)).toBeInTheDocument();
    expect(screen.getByText(/계좌이체 수수료/)).toBeInTheDocument();
  });

  it('채움 카운터가 입력된 칸 수를 보여준다', () => {
    renderStep({ fees: { card: '1.5' } });
    expect(screen.getByTestId('fees-count')).toHaveTextContent('1/2');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// components/inbox/bid-wizard/BidStepFees.tsx
'use client';

import { Button } from '@/components/primitives/Button';
import { PercentInput } from '@/components/forms/inputs';
import {
  PAYMENT_METHOD_LABELS,
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

export function BidStepFees({
  feeInputMethods,
  customPaymentMethods,
  fees,
  onFee,
  onBack,
  onNext,
}: Props) {
  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
  const total = feeInputMethods.length + customPaymentMethods.length;
  const filled =
    feeInputMethods.filter((m) => feeFilled(m)).length +
    customPaymentMethods.filter((c) => feeFilled(c.id)).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          요청된 {total}개 결제수단 · 1개 이상 입력하면 발송할 수 있어요
        </p>
        <span
          data-testid="fees-count"
          className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]"
        >
          {filled}/{total}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {feeInputMethods.map((m) => (
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

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`
Expected: PASS (2).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidStepFees.tsx components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx
git commit -m "feat(bid-wizard): 2단계 수수료 컴포넌트"
```

---

### Task 7: `BidStepProposal` (3단계)

기존 `BidForm.tsx` 476–562줄(03 견적서: PDF 업로드 + 메모)을 이관. 업로드 상태/핸들러는 컨테이너가 소유하고 prop으로 받는다(테스트 단순화).

**Files:**
- Create: `components/inbox/bid-wizard/BidStepProposal.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidStepProposal } from '../BidStepProposal';

afterEach(cleanup);

function renderStep(over: Partial<React.ComponentProps<typeof BidStepProposal>> = {}) {
  const onMemoChange = vi.fn();
  const onUpload = vi.fn();
  render(
    <BidStepProposal
      proposal={null}
      memo=""
      onUpload={onUpload}
      onClear={vi.fn()}
      onMemoChange={onMemoChange}
      onBack={vi.fn()}
      onNext={vi.fn()}
      {...over}
    />,
  );
  return { onMemoChange, onUpload };
}

describe('BidStepProposal', () => {
  it('업로드 전에는 PDF 업로드 버튼을 보여준다', () => {
    renderStep();
    expect(screen.getByText(/PDF 업로드/)).toBeInTheDocument();
  });

  it('PDF 파일 선택 시 onUpload 호출', async () => {
    const user = userEvent.setup();
    const { onUpload } = renderStep();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'p.pdf', { type: 'application/pdf' }));
    expect(onUpload).toHaveBeenCalled();
  });

  it('메모 입력 시 onMemoChange 호출', async () => {
    const user = userEvent.setup();
    const { onMemoChange } = renderStep();
    await user.type(screen.getByPlaceholderText(/추가 안내/), 'a');
    expect(onMemoChange).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** (BidForm 476–562 마크업 이관 + footer; `proposal` 타입은 BidForm과 동일)

```tsx
// components/inbox/bid-wizard/BidStepProposal.tsx
'use client';

import { useRef } from 'react';
import { Label } from '@/components/primitives/Label';
import { Button } from '@/components/primitives/Button';
import { underlineInputClass } from '@/components/forms/inputs';
import { cn } from '@/lib/utils';

export type ProposalState =
  | { id: string; name: string; size: number }
  | { name: string; status: 'uploading' }
  | { name: string; status: 'error'; error: string }
  | null;

type Props = {
  proposal: ProposalState;
  memo: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  onMemoChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function BidStepProposal({
  proposal,
  memo,
  onUpload,
  onClear,
  onMemoChange,
  onBack,
  onNext,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const proposalReady = proposal && 'id' in proposal;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label size="md" muted={false}>견적서 PDF (선택)</Label>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
          {!proposal && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="block w-full border border-dashed border-[var(--md-sys-color-outline)] py-5 text-center hover:border-[var(--md-sys-color-on-surface)] transition-colors"
            >
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                PDF 업로드 (클릭)
              </p>
              <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-outline)] mt-1">
                20MB 이내
              </p>
            </button>
          )}
          {proposal && 'status' in proposal && proposal.status === 'uploading' && (
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-outline)]">
              {proposal.name} — UPLOADING…
            </p>
          )}
          {proposal && 'status' in proposal && proposal.status === 'error' && (
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
                {proposal.name} — {proposal.error}
              </p>
              <button
                type="button"
                onClick={onClear}
                className="font-mono text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] px-1"
              >
                ×
              </button>
            </div>
          )}
          {proposalReady && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">{proposal.name}</span>
                <button
                  type="button"
                  onClick={onClear}
                  className="font-mono text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] px-1 shrink-0"
                >
                  ×
                </button>
              </div>
              <iframe
                src={`/api/files/${proposal.id}`}
                title={proposal.name}
                className="w-full h-[320px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)]"
              />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label size="md" muted={false}>메모</Label>
          <textarea
            value={memo}
            onChange={(e) => onMemoChange(e.target.value)}
            rows={3}
            placeholder="추가 안내 사항이 있으면 입력하세요."
            className={cn(underlineInputClass, 'resize-none')}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          수수료
        </Button>
        <Button type="button" onClick={onNext} trailingIcon={<span aria-hidden>→</span>}>
          검토·발송
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx`
Expected: PASS (3).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidStepProposal.tsx components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx
git commit -m "feat(bid-wizard): 3단계 견적서 컴포넌트"
```

---

### Task 8: `BidStepReview` (4단계 — 요약 · 비가역 경고 · 템플릿 저장 · 발송)

설계 §2.3: 4단계에서만 '템플릿 저장' 노출, 비가역 경고가 시각 지배. 템플릿 저장 로컬 UI 상태는 이 컴포넌트가 소유하고 `onSaveTemplate(name)` 만 호출.

**Files:**
- Create: `components/inbox/bid-wizard/BidStepReview.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidStepReview } from '../BidStepReview';
import type { PaymentMethod } from '@/lib/types/bid';

afterEach(cleanup);

function renderStep(over: Partial<React.ComponentProps<typeof BidStepReview>> = {}) {
  const onSubmit = vi.fn();
  const onSaveTemplate = vi.fn(async () => ({ ok: true as const }));
  render(
    <BidStepReview
      settleCycle="D+1"
      settleLimit="0"
      guaranteeInsurance="0"
      feeInputMethods={['card'] as PaymentMethod[]}
      customPaymentMethods={[]}
      fees={{ card: '1.5' }}
      canSubmit
      pending={false}
      submitError={null}
      onBack={vi.fn()}
      onSubmit={onSubmit}
      onSaveTemplate={onSaveTemplate}
      {...over}
    />,
  );
  return { onSubmit, onSaveTemplate };
}

describe('BidStepReview', () => {
  it('비가역 경고를 보여준다', () => {
    renderStep();
    expect(screen.getByText(/한 번만/)).toBeInTheDocument();
  });

  it('canSubmit=false면 발송 버튼 비활성', () => {
    renderStep({ canSubmit: false });
    expect(screen.getByRole('button', { name: /견적 보내기/ })).toBeDisabled();
  });

  it('발송 버튼 클릭 시 onSubmit 호출', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderStep();
    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('템플릿 저장 토글 → 이름 입력 → 저장 시 onSaveTemplate(name) 호출', async () => {
    const user = userEvent.setup();
    const { onSaveTemplate } = renderStep();
    await user.click(screen.getByRole('button', { name: '템플릿으로 저장' }));
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '기본요율');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(onSaveTemplate).toHaveBeenCalledWith('기본요율');
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// components/inbox/bid-wizard/BidStepReview.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { underlineInputClass } from '@/components/forms/inputs';
import { cn } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABELS,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import { formatKRW } from '@/lib/format';

const ERROR_LABELS: Record<string, string> = {
  FORBIDDEN_PG: 'PG 사용자 권한이 필요합니다.',
  FORBIDDEN: '이 견적 요청에 견적을 보낼 권한이 없어요.',
  INVALID_INPUT: '입력 값을 확인해주세요.',
  RFP_NOT_FOUND: '견적 요청을 찾을 수 없어요.',
  RFP_NOT_OPEN: '마감됐거나 이미 종료된 견적 요청이에요.',
  INVITATION_NOT_FOUND: '초대 내역을 찾을 수 없어요.',
  BID_ALREADY_SUBMITTED: '이미 견적을 보냈어요.',
  PAYMENT_METHOD_NOT_REQUESTED: '구매사가 요청하지 않은 결제수단입니다.',
  LIMIT_REACHED: '템플릿은 최대 20개까지 저장할 수 있어요.',
};

type Props = {
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  canSubmit: boolean;
  pending: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
  onSaveTemplate: (name: string) => Promise<{ ok: boolean; error?: string }>;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 flex items-baseline justify-between">
      <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)]">{value}</span>
    </div>
  );
}

export function BidStepReview({
  settleCycle,
  settleLimit,
  guaranteeInsurance,
  feeInputMethods,
  customPaymentMethods,
  fees,
  canSubmit,
  pending,
  submitError,
  onBack,
  onSubmit,
  onSaveTemplate,
}: Props) {
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplError, setTplError] = useState<string | null>(null);
  const [tplSaving, setTplSaving] = useState(false);

  const feeRows = [
    ...feeInputMethods
      .filter((m) => (fees[m] ?? '') !== '')
      .map((m) => [PAYMENT_METHOD_LABELS[m], `${fees[m]}%`] as [string, string]),
    ...customPaymentMethods
      .filter((c) => (fees[c.id] ?? '') !== '')
      .map((c) => [c.label, `${fees[c.id]}%`] as [string, string]),
  ];

  const handleSaveTemplate = async () => {
    const name = tplName.trim();
    if (!name) return;
    setTplError(null);
    setTplSaving(true);
    const r = await onSaveTemplate(name);
    setTplSaving(false);
    if (r.ok) {
      setTplOpen(false);
      setTplName('');
    } else {
      setTplError(r.error ?? 'INVALID_INPUT');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">보낼 견적</span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          <Row label="정산 주기" value={settleCycle} />
          <Row label="정산한도" value={formatKRW(parseInt(settleLimit) || 0)} />
          <Row label="월 보증보험" value={formatKRW(parseInt(guaranteeInsurance) || 0)} />
          {feeRows.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <div className="rounded-[6px] border border-[var(--md-sys-color-warning)] bg-[color-mix(in_srgb,var(--md-sys-color-warning)_12%,transparent)] px-4 py-3">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface)]">
          ⚠️ 견적은 <b>한 번만</b> 보낼 수 있고, 보낸 뒤에는 수정할 수 없어요.
        </p>
      </div>

      {/* 템플릿 저장 (4단계 전용) */}
      <div className="space-y-2">
        {!tplOpen ? (
          <button
            type="button"
            onClick={() => {
              setTplError(null);
              setTplOpen(true);
            }}
            className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            템플릿으로 저장
          </button>
        ) : (
          <div className="flex items-end gap-2 border border-[var(--md-sys-color-outline-variant)] rounded-[6px] px-3 py-2.5">
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="템플릿 이름"
              maxLength={80}
              className={cn(underlineInputClass, 'flex-1')}
            />
            <Button type="button" size="sm" onClick={handleSaveTemplate} disabled={!tplName.trim() || tplSaving}>
              저장
            </Button>
            <Button type="button" size="sm" variant="text" onClick={() => { setTplOpen(false); setTplName(''); }}>
              취소
            </Button>
          </div>
        )}
        {tplError && (
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
            {ERROR_LABELS[tplError] ?? tplError}
          </p>
        )}
      </div>

      {submitError && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
          {ERROR_LABELS[submitError] ?? submitError}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          견적서
        </Button>
        <Button type="button" size="lg" onClick={onSubmit} disabled={!canSubmit}>
          {pending ? '보내는 중…' : '견적 보내기'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx`
Expected: PASS (4).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidStepReview.tsx components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx
git commit -m "feat(bid-wizard): 4단계 검토·발송 컴포넌트"
```

---

## Phase 3 — 컨텍스트 strip

### Task 9: `BidContextStrip`

설계 §2.4: 얇은 상단 strip(구매사명 + 단계 요청 핵심) + '요청 전문 ▾' 펼침(기존 `RfpBriefPanel` 재사용).

**Files:**
- Create: `components/inbox/bid-wizard/BidContextStrip.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidContextStrip.test.tsx`

- [ ] **Step 1: 실패 테스트 작성** (RfpBriefPanel은 mock — strip 자체 로직만 검증)

```tsx
// components/inbox/bid-wizard/__tests__/BidContextStrip.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentMethod } from '@/lib/types/bid';

vi.mock('../../RfpBriefPanel', () => ({
  RfpBriefPanel: () => <div data-testid="brief">brief</div>,
}));

import { BidContextStrip } from '../BidContextStrip';

afterEach(cleanup);

// 최소 rfp shape — strip은 buyerName/payment만 직접 쓰고 나머지는 RfpBriefPanel(mock)로 전달
const rfp = { requiredPaymentMethods: ['card', 'bank'] as PaymentMethod[] } as never;

describe('BidContextStrip', () => {
  it('구매사명을 항상 보여준다', () => {
    render(<BidContextStrip buyerName="토스페이먼츠" rfp={rfp} currentStep={1} feeInputMethods={['card', 'bank']} />);
    expect(screen.getByText(/토스페이먼츠/)).toBeInTheDocument();
  });

  it('2단계에서 요청 결제수단 라벨을 strip에 노출', () => {
    render(<BidContextStrip buyerName="토스페이먼츠" rfp={rfp} currentStep={2} feeInputMethods={['card', 'bank']} />);
    expect(screen.getByText(/카드/)).toBeInTheDocument();
    expect(screen.getByText(/계좌이체/)).toBeInTheDocument();
  });

  it("'요청 전문' 토글 전에는 RfpBriefPanel이 숨겨져 있다", async () => {
    const user = userEvent.setup();
    render(<BidContextStrip buyerName="토스페이먼츠" rfp={rfp} currentStep={1} feeInputMethods={['card']} />);
    expect(screen.queryByTestId('brief')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /요청 전문/ }));
    expect(screen.getByTestId('brief')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidContextStrip.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// components/inbox/bid-wizard/BidContextStrip.tsx
'use client';

import { useState } from 'react';
import { RfpBriefPanel } from '../RfpBriefPanel';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/types/bid';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

type Props = {
  buyerName: string;
  rfp: PgRfpDetailData['rfp'];
  currentStep: number;
  feeInputMethods: PaymentMethod[];
};

export function BidContextStrip({ buyerName, rfp, currentStep, feeInputMethods }: Props) {
  const [open, setOpen] = useState(false);

  // 단계별 '요청 핵심' — 2단계(수수료)에선 요청 결제수단을 노출.
  const hint =
    currentStep === 2
      ? `요청: ${feeInputMethods.map((m) => PAYMENT_METHOD_LABELS[m]).join(' · ')} 수수료`
      : '견적 요청 정보';

  return (
    <div className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <span className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          <span className="text-[var(--md-sys-color-on-surface)] font-medium">{buyerName}</span>
          <span className="mx-2 text-[var(--md-sys-color-outline-variant)]">·</span>
          {hint}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          요청 전문 {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div className="border-t border-[var(--md-sys-color-outline-variant)] px-4 py-5 max-h-[420px] overflow-y-auto">
          <RfpBriefPanel rfp={rfp} buyerName={buyerName} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidContextStrip.test.tsx`
Expected: PASS (3).

> 주: `RfpBriefPanel` 의 실제 prop 이름이 `rfp`/`buyerName` 이 맞는지 `components/inbox/RfpBriefPanel.tsx` 와 `PgRfpDetailContent.tsx:41`(`<RfpBriefPanel rfp={rfp} buyerName={buyerName} />`)에서 재확인. 다르면 위 호출부를 그에 맞춘다.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidContextStrip.tsx components/inbox/bid-wizard/__tests__/BidContextStrip.test.tsx
git commit -m "feat(bid-wizard): 컨텍스트 strip 컴포넌트"
```

---

## Phase 4 — 컨테이너 + 페이지 통합

### Task 10: `BidWizard` 컨테이너

`BidForm` 의 오케스트레이션 로직(상태·자동저장·템플릿 적용·제출·ConfirmDialog)을 옮기고, 단계 컴포넌트를 조립한다. 신규 비즈니스 로직 없음 — `buildPaymentFees`/`applyTemplate`/`doSubmit` 등은 BidForm에서 그대로 이관.

**Files:**
- Create: `components/inbox/bid-wizard/BidWizard.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

- [ ] **Step 1: 실패 테스트 작성** (BidForm.test.tsx 패턴 차용 — 제출/단계이동/자동저장 핵심만)

```tsx
// components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentMethod } from '@/lib/types/bid';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const submitBidMock = vi.fn(async (_i: unknown) => ({ ok: true as const, bidId: 'b1' }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (i: unknown) => submitBidMock(i),
}));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: vi.fn(async () => ({ ok: true as const, templateId: 't1' })),
}));
// RfpBriefPanel은 strip 펼침 전에는 렌더되지 않지만, import 안전을 위해 mock.
vi.mock('../../RfpBriefPanel', () => ({ RfpBriefPanel: () => <div /> }));

import { BidWizard } from '../BidWizard';

const rfp = {
  id: 'rfp-uuid',
  code: 'P-2606-0001',
  requiredPaymentMethods: ['card'] as PaymentMethod[],
  customPaymentMethods: [],
} as never;

beforeEach(() => {
  localStorage.clear();
  pushMock.mockClear();
  submitBidMock.mockClear();
});
afterEach(cleanup);

describe('BidWizard', () => {
  it('1단계 정산조건이 먼저 보인다 (요청한 결제수단 입력칸은 2단계로 이동해야 보임)', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.getByText('정산 주기 *')).toBeInTheDocument();
    expect(screen.queryByText(/카드 수수료/)).not.toBeInTheDocument();
  });

  it('단계 이동 후 정산주기+수수료 입력 → 발송 → submitBidAction 호출 + /submitted 이동', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    // step1: 정산주기 입력
    await user.clear(screen.getByPlaceholderText('1'));
    await user.type(screen.getByPlaceholderText('1'), '1');
    await user.click(screen.getByRole('button', { name: '수수료' }));

    // step2: 카드 수수료 입력
    const cardFee = screen.getByLabelText(/카드 수수료/);
    await user.type(cardFee, '1.5');
    await user.click(screen.getByRole('button', { name: '견적서' }));

    // step3 → step4
    await user.click(screen.getByRole('button', { name: '검토·발송' }));

    // step4: 발송 → 확인 다이얼로그 → 확인
    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));
    await user.click(await screen.findByRole('button', { name: '견적 보내기' })); // confirm dialog confirm

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    expect(submitBidMock.mock.calls[0][0]).toMatchObject({
      rfpId: 'rfp-uuid',
      settleCycle: 'D+1',
      paymentFees: { card: 0.015 },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/inbox/P-2606-0001/submitted'));
  });
});
```

> 주: `PercentInput` 가 label↔input 을 `htmlFor`/`aria-label` 로 연결하는지 `components/forms/inputs.tsx` 에서 확인. `getByLabelText` 가 안 잡히면 `getByRole('spinbutton'|'textbox', { name: /카드 수수료/ })` 또는 컨테이너 쿼리로 대체. confirm 다이얼로그의 확인 버튼 접근명(`견적 보내기`)은 `ConfirmDialog` 의 `confirmLabel` 과 일치(중복 매칭 시 `findAllByRole` 후 마지막 선택).

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// components/inbox/bid-wizard/BidWizard.tsx
'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { useBidDraft, type BidDraft } from '../useBidDraft';
import { submitBidAction } from '@/lib/server/actions/bid';
import { saveQuoteTemplateAction } from '@/lib/server/actions/quote-template/saveQuoteTemplateAction';
import {
  PAYMENT_METHOD_CATEGORIES,
  type PaymentMethod,
} from '@/lib/types/bid';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { QuoteTemplateOption } from '../BidForm';

import { WizardStepSidebar } from '@/components/rfp/WizardStepSidebar';
import { WizardProgressBar } from '@/components/rfp/WizardProgressBar';
import { BID_WIZARD_STEPS } from './bid-wizard-steps';
import { getBidWizardValidity, getFirstIncompleteBidStep } from './bid-wizard-validation';
import { BidContextStrip } from './BidContextStrip';
import { BidStepSettlement } from './BidStepSettlement';
import { BidStepFees } from './BidStepFees';
import { BidStepProposal, type ProposalState } from './BidStepProposal';
import { BidStepReview } from './BidStepReview';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap((c) => c.methods);
const TOTAL_STEPS = BID_WIZARD_STEPS.length;

type Props = {
  rfp: PgRfpDetailData['rfp'];
  buyerName: string;
  templates?: QuoteTemplateOption[];
};

export function BidWizard({ rfp, buyerName, templates = [] }: Props) {
  const router = useRouter();
  const rfpId = rfp.id;
  const rfpCode = rfp.code;
  const requiredPaymentMethods = rfp.requiredPaymentMethods;
  const customPaymentMethods = rfp.customPaymentMethods;

  const [pending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const [fields, setFields] = useState<BidDraft>({
    __v: 2,
    cycleUnit: 'D',
    cycleNum: '1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    fees: {},
    memo: '',
  });
  const setField = <K extends keyof BidDraft>(key: K, value: BidDraft[K]) =>
    setFields((f) => ({ ...f, [key]: value }));
  const setFee = (key: string, value: string) =>
    setFields((f) => ({ ...f, fees: { ...f.fees, [key]: value } }));
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, fees, memo } = fields;

  // 초안 자동저장 (BidForm 동일)
  const { draft, saveDraft, clearDraft, savedAt } = useBidDraft(rfpId);
  const [showRestoreBanner, setShowRestoreBanner] = useState(draft !== null);
  const draftDismissed = useRef(false);
  useEffect(() => {
    if (!draftDismissed.current) saveDraft(fields);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = () => {
    if (!draft) return;
    setFields(draft);
    setShowRestoreBanner(false);
  };
  const handleDismiss = () => {
    draftDismissed.current = true;
    clearDraft();
    setShowRestoreBanner(false);
  };

  // 견적서 업로드 (BidForm 동일)
  const [proposal, setProposal] = useState<ProposalState>(null);
  const uploadProposal = async (file: File): Promise<void> => {
    if (file.type !== 'application/pdf') {
      setProposal({ name: file.name, status: 'error', error: 'PDF만 업로드 가능합니다.' });
      return;
    }
    setProposal({ name: file.name, status: 'uploading' });
    const form = new FormData();
    form.append('file', file);
    form.append('ownerKind', 'bid_proposal');
    form.append('ownerId', rfpId);
    try {
      const body = await http.post('/api/files/upload', { body: form }).json<{ id: string; name: string; size: number }>();
      setProposal(body);
    } catch (err) {
      let error = err instanceof Error ? err.message : '네트워크 오류';
      if (err instanceof HTTPError) {
        const { status } = err.response;
        error = status === 413 ? '파일이 너무 큽니다 (최대 20MB)' : status === 415 ? '지원되지 않는 파일 형식입니다' : `업로드 실패 (${status})`;
      }
      setProposal({ name: file.name, status: 'error', error });
    }
  };
  const proposalReady = proposal && 'id' in proposal;
  const proposalUploading = proposal && 'status' in proposal && proposal.status === 'uploading';

  // 파생값 (BidForm 동일)
  const feeInputMethods = requiredPaymentMethods.length > 0 ? requiredPaymentMethods : ALL_PAYMENT_METHODS;
  const settleCycle = `${cycleUnit}+${cycleNum || '1'}`;
  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
  const anyFeeFilled =
    feeInputMethods.some((m) => feeFilled(m)) || customPaymentMethods.some((c) => feeFilled(c.id));
  const canSubmit = !pending && !proposalUploading && cycleNum !== '' && parseInt(cycleNum) > 0 && anyFeeFilled;

  const pct = (s: string) => parseFloat(s) / 100;
  const buildPaymentFees = (): Partial<Record<PaymentMethod, number>> => {
    const out: Partial<Record<PaymentMethod, number>> = {};
    for (const m of feeInputMethods) {
      const v = fees[m] ?? '';
      if (v !== '') out[m] = pct(v);
    }
    return out;
  };
  const fmtPct = (rate: number) => String(Math.round(rate * 1e6) / 1e4);
  const applyTemplate = (t: QuoteTemplateOption) => {
    const m = /^([DWM])\+(\d+)$/.exec(t.settleCycle);
    const unit = (m?.[1] ?? 'D') as 'D' | 'W' | 'M';
    const num = m?.[2] ?? '1';
    setFields((f) => {
      const nextFees = { ...f.fees };
      for (const method of feeInputMethods) {
        const rate = t.paymentFees[method];
        if (rate !== undefined) nextFees[method] = fmtPct(rate);
      }
      return { ...f, cycleUnit: unit, cycleNum: num, settleLimit: String(t.settleLimit), guaranteeInsurance: String(t.guaranteeInsurance), fees: nextFees };
    });
  };

  // 단계 이동 — 자유 점프(구매사 위저드 미러)
  const completed = getBidWizardValidity({ cycleNum, anyFeeFilled }).map((s) => s.complete);
  const advance = () => setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setCurrentStep((s) => Math.max(1, s - 1));
  const goToStep = (step: number) => setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, step)));

  const onSaveTemplate = async (name: string) => {
    const r = await saveQuoteTemplateAction({
      name,
      settleCycle,
      settleLimit: parseInt(settleLimit) || 0,
      guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
      paymentFees: buildPaymentFees(),
    });
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  };

  const handleSubmit = () => {
    // 발송 버튼은 막지 않되, 미충족 단계가 있으면 그 단계로 이동.
    const incomplete = getFirstIncompleteBidStep({ cycleNum, anyFeeFilled });
    if (incomplete) {
      setCurrentStep(incomplete.num);
      return;
    }
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = () => {
    setSubmitConfirmOpen(false);
    const paymentFees = buildPaymentFees();
    const customFees: Record<string, number> = {};
    for (const c of customPaymentMethods) {
      const v = fees[c.id] ?? '';
      if (v !== '') customFees[c.id] = pct(v);
    }
    startTransition(async () => {
      const r = await submitBidAction({
        rfpId,
        settleCycle,
        settleLimit: parseInt(settleLimit) || 0,
        guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
        paymentFees,
        customFees,
        proposalAttachmentId: proposalReady ? proposal.id : undefined,
        memo: memo.trim() || undefined,
      });
      if (r.ok) {
        clearDraft();
        router.push(`/inbox/${rfpCode}/submitted`);
      } else {
        setSubmitError(r.error);
        setCurrentStep(4);
      }
    });
  };

  return (
    <>
      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={(o) => !o && setSubmitConfirmOpen(false)}
        title="견적을 보낼까요?"
        description="보낸 후에는 수정할 수 없어요."
        confirmLabel="견적 보내기"
        variant="default"
        onConfirm={doSubmit}
        loading={pending}
      />

      {currentStep === 1 && showRestoreBanner && (
        <div className="mb-4 flex items-center justify-between px-4 py-2.5 border border-[var(--md-sys-color-secondary-container)] rounded-[6px] bg-[var(--md-sys-color-secondary-container)]">
          <span className="text-[13px] text-[var(--md-sys-color-on-secondary-container)]">이전에 작성 중이던 내용이 있습니다</span>
          <div className="flex gap-2">
            <button type="button" onClick={handleRestore} className="text-[12px] text-[var(--md-sys-color-on-secondary-container)] underline underline-offset-2">불러오기</button>
            <button type="button" onClick={handleDismiss} className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">무시</button>
          </div>
        </div>
      )}

      <div className="border border-[var(--md-sys-color-outline-variant)] rounded-[8px] overflow-hidden">
        <BidContextStrip buyerName={buyerName} rfp={rfp} currentStep={currentStep} feeInputMethods={feeInputMethods} />

        <div className="flex min-h-0">
          <WizardStepSidebar
            currentStep={currentStep}
            completed={completed}
            onStepClick={goToStep}
            steps={BID_WIZARD_STEPS}
            title="견적 작성"
            footer={
              savedAt ? (
                <span className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
                  💾 자동저장됨 · {savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              ) : null
            }
          />

          <div className="flex-1 min-w-0 flex flex-col">
            <WizardProgressBar currentStep={currentStep} completed={completed} onStepClick={goToStep} steps={BID_WIZARD_STEPS} />

            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-6">
                <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                  {String(currentStep).padStart(2, '0')} — {BID_WIZARD_STEPS[currentStep - 1].label}
                </span>
                <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
              </div>

              {currentStep === 1 && (
                <div className="space-y-8">
                  {templates.length > 0 && (
                    <div className="space-y-1">
                      <Label size="md" muted={false}>견적 템플릿 불러오기</Label>
                      <Select
                        options={[{ value: '', label: '템플릿 선택…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
                        value=""
                        onChange={(id) => {
                          const t = templates.find((x) => x.id === id);
                          if (t) applyTemplate(t);
                        }}
                      />
                    </div>
                  )}
                  <BidStepSettlement
                    cycleUnit={cycleUnit}
                    cycleNum={cycleNum}
                    settleLimit={settleLimit}
                    guaranteeInsurance={guaranteeInsurance}
                    onField={setField}
                    onNext={advance}
                  />
                </div>
              )}

              {currentStep === 2 && (
                <BidStepFees
                  feeInputMethods={feeInputMethods}
                  customPaymentMethods={customPaymentMethods}
                  fees={fees}
                  onFee={setFee}
                  onBack={back}
                  onNext={advance}
                />
              )}

              {currentStep === 3 && (
                <BidStepProposal
                  proposal={proposal}
                  memo={memo}
                  onUpload={(f) => void uploadProposal(f)}
                  onClear={() => setProposal(null)}
                  onMemoChange={(v) => setField('memo', v)}
                  onBack={back}
                  onNext={advance}
                />
              )}

              {currentStep === 4 && (
                <BidStepReview
                  settleCycle={settleCycle}
                  settleLimit={settleLimit}
                  guaranteeInsurance={guaranteeInsurance}
                  feeInputMethods={feeInputMethods}
                  customPaymentMethods={customPaymentMethods}
                  fees={fees}
                  canSubmit={canSubmit}
                  pending={pending}
                  submitError={submitError}
                  onBack={back}
                  onSubmit={handleSubmit}
                  onSaveTemplate={onSaveTemplate}
                />
              )}

              {/* 자동저장 표시는 사이드바 footer 로 이동(설계 승인 목업과 일치) */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS (2). 실패 시 위 "주"의 셀렉터/접근명 대체안 적용.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "feat(bid-wizard): 위저드 컨테이너 + 단계 조립"
```

---

### Task 11: `PgRfpDetailContent` — peek/full 분기 + full에 위저드

**⚠️ 두 렌더 컨텍스트**: `PgRfpDetailContent` 는 (a) 전체 페이지 `app/(app)/inbox/[rfpId]/page.tsx:46` 와 (b) **인박스 peek 슬라이드오버** `components/inbox/InboxPeekPanel.tsx:32` 둘 다에서 렌더된다. 풀 위저드(160px 사이드바 + strip)는 좁은 peek 오버레이에 부적합하다. 따라서:
- **peek**(기본): 읽기전용 `RfpBriefPanel` + "견적 작성 →" CTA(전체 페이지로 이동). Task 14의 행 행동(견적 작성 → `/inbox/[code]`)과 일관.
- **full**(전체 페이지): `BidWizard`.

`variant` prop으로 분기하고 **기본값을 `'peek'`** 으로 둬 기존 peek 호출부(InboxPeekPanel)는 수정 없이 안전.

**Files:**
- Modify: `components/inbox/PgRfpDetailContent.tsx`
- Modify: `app/(app)/inbox/[rfpId]/page.tsx` (호출부에 `variant="full"`)
- Test: `components/inbox/__tests__/PgRfpDetailContent.test.tsx` (없으면 생성)

- [ ] **Step 1: 실패 테스트 작성** — full=위저드, peek=브리프+CTA, 제출완료=링크.

```tsx
// components/inbox/__tests__/PgRfpDetailContent.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../RfpBriefPanel', () => ({ RfpBriefPanel: () => <div data-testid="brief" /> }));

import { PgRfpDetailContent } from '../PgRfpDetailContent';

const baseRfp = {
  id: 'rfp-uuid',
  code: 'P-2606-0001',
  title: '테스트 RFP',
  deadline: new Date(Date.now() + 7 * 864e5).toISOString(),
  requiredPaymentMethods: ['card'],
  customPaymentMethods: [],
  bizProfile: undefined,
} as never;

const data = (over: Record<string, unknown> = {}) =>
  ({ rfp: baseRfp, myBid: null, buyerName: '토스', quoteTemplates: [], ...over } as never);

afterEach(cleanup);

describe('PgRfpDetailContent', () => {
  it('variant="full" 미제출 시 견적 작성 위저드(검토·발송 단계 라벨)를 렌더', () => {
    render(<PgRfpDetailContent data={data()} variant="full" />);
    // '검토·발송'은 위저드 사이드바에만 존재 — BidForm/브리프엔 없는 신호
    expect(screen.getByText('검토·발송')).toBeInTheDocument();
  });

  it('variant="peek"(기본) 미제출 시 위저드가 아니라 브리프 + "견적 작성" CTA를 렌더', () => {
    render(<PgRfpDetailContent data={data()} />);
    expect(screen.queryByText('검토·발송')).not.toBeInTheDocument();
    expect(screen.getByTestId('brief')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /견적 작성/ })).toHaveAttribute('href', '/inbox/P-2606-0001');
  });

  it('제출 완료 시 "보낸 견적 보기" 링크를 렌더', () => {
    render(<PgRfpDetailContent data={data({ myBid: { submittedAt: baseRfp.deadline } })} />);
    expect(screen.getByText(/보낸 견적 보기/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/__tests__/PgRfpDetailContent.test.tsx`
Expected: FAIL — `variant` prop 미지원 + '검토·발송'(위저드 사이드바 라벨, 현재 BidForm은 렌더 안 함) 없음. (이 신호는 교체 전 반드시 실패 → 진짜 RED.)

- [ ] **Step 3: 구현 — variant 분기**

`components/inbox/PgRfpDetailContent.tsx`:
- import 교체: `import { BidForm } from './BidForm';` → `import { BidWizard } from './bid-wizard/BidWizard';`
- 시그니처: `export function PgRfpDetailContent({ data, variant = 'peek' }: { data: PgRfpDetailData; variant?: 'peek' | 'full' }) {`
- `myBid` 분기는 그대로 유지(브리프 + "보낸 견적 보기" — peek/full 공통).
- 미제출 `return (...)`(현재 37–63줄, `grid grid-cols-[340px_1fr]` 블록)을 다음으로 교체:

```tsx
  if (variant === 'full') {
    return <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} />;
  }

  // peek(기본): 읽기전용 브리프 + 전체 페이지로 가는 '견적 작성' CTA
  return (
    <div>
      <RfpBriefPanel rfp={rfp} buyerName={buyerName} />
      <div className="mt-8 border-t border-[var(--md-sys-color-outline-variant)] pt-6">
        <Link
          href={`/inbox/${rfp.code}`}
          className="inline-flex items-center rounded-[6px] bg-[var(--md-sys-color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
        >
          견적 작성 →
        </Link>
      </div>
    </div>
  );
```

- 전체 페이지 호출부 `app/(app)/inbox/[rfpId]/page.tsx:46` 를 `return <PgRfpDetailContent data={data} variant="full" />;` 로 변경. (InboxPeekPanel·loading 은 기본 'peek' 유지 — 수정 불필요.)

- `PgRfpDetailContent.Skeleton`(66–94줄)을 단일 컬럼 위저드 스켈레톤으로 교체(peek/full 공통 — 단순 스켈레톤):

```tsx
PgRfpDetailContent.Skeleton = function PgRfpDetailContentSkeleton() {
  return (
    <div className="border border-[var(--md-sys-color-outline-variant)] rounded-[8px] overflow-hidden">
      <div className="border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5">
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="flex">
        <div className="w-[160px] border-r border-[var(--md-sys-color-outline-variant)] px-3 py-5 hidden lg:block space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-4 w-24" />))}
        </div>
        <div className="flex-1 px-6 py-6 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full" />))}
        </div>
      </div>
    </div>
  );
};
```

(`myBid` 분기와 `RfpBriefPanel`/`LocalTime` import는 그대로 유지. peek CTA용 `Link` 는 이미 import됨 — 없으면 `import Link from 'next/link';` 추가.)

- [ ] **Step 4: GREEN 확인 + peek 회귀**

Run: `pnpm test components/inbox/__tests__/PgRfpDetailContent.test.tsx`
Expected: PASS (3).
Run: `pnpm tsc --noEmit 2>&1 | grep -iE "InboxPeekPanel|inbox/\[rfpId\]/page"`
Expected: 출력 없음(peek 호출부는 기본 variant로 그대로 컴파일).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/PgRfpDetailContent.tsx components/inbox/__tests__/PgRfpDetailContent.test.tsx "app/(app)/inbox/[rfpId]/page.tsx"
git commit -m "feat(inbox): 견적 상세 full=위저드 / peek=브리프+CTA 분기"
```

---

### Task 12: `BidForm` 제거 + 테스트 이관 정리

**Files:**
- Delete: `components/inbox/BidForm.tsx` (단, `QuoteTemplateOption` 타입은 위저드가 import 중)
- Delete/Port: `components/inbox/__tests__/BidForm.test.tsx`

- [ ] **Step 1: `QuoteTemplateOption` 타입 이전**

`QuoteTemplateOption`(현 `BidForm.tsx:52–59`)을 `components/inbox/bid-wizard/types.ts` 로 옮긴다(이미 `BidWizard.tsx`/`BidStepReview` 의존). `types.ts` 에 추가:

```ts
import type { PaymentMethod } from '@/lib/types/bid';

export type QuoteTemplateOption = {
  id: string;
  name: string;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  paymentFees: Partial<Record<PaymentMethod, number>>;
};
```

그리고 `BidWizard.tsx` 의 `import type { QuoteTemplateOption } from '../BidForm';` 를 `from './types';` 로 변경. `PgRfpDetailData`/loader 가 `QuoteTemplateOption` 을 `BidForm` 에서 import 하는지 검색:

Run: `grep -rn "from '@/components/inbox/BidForm'\|from './BidForm'\|from '../BidForm'" --include=*.ts --include=*.tsx .`
모든 import 를 `bid-wizard/types`(타입) 또는 `bid-wizard/BidWizard`(컴포넌트)로 교체.

- [ ] **Step 2: `BidForm.test.tsx` 케이스 매핑 (삭제 전 필수)**

각 `it()` 를 신규 테스트로 매핑한다. "동등하다" 가정 금지 — 표를 채우고 **미커버 행은 이관**한다:

| BidForm.test 케이스 | 대체 위치 | 상태 |
|---|---|---|
| 제안서 업로드 http.post 호출 | `BidStepProposal.test`(onUpload) + 아래 이관(413 매핑) | 이관 |
| 413 → 파일 크기 오류 메시지 | **미커버 → 이관**(매핑 로직이 `BidWizard.uploadProposal` 로 이동) | 이관 |
| 결제수단 동적 렌더(요청/커스텀/카드) | `BidStepFees.test` | 보강 |
| paymentFees/customFees 분리 제출 | `BidWizard.test`(커스텀 포함 케이스 **이관**) | 이관 |
| 요율 미입력 시 제출 비활성 | `BidStepReview.test`(canSubmit=false) | 커버됨 |
| 드래프트 배너 없음/표시/불러오기/무시/제출 후 제거 | **미커버 → 이관**(BidWizard step1) | 이관 |
| 비가역 경고 텍스트 | `BidStepReview.test`(한 번만) | 커버됨 |
| 템플릿 셀렉트 렌더/적용/저장 | `BidStepReview.test`(저장) + **적용 이관**(BidWizard step1) | 이관 |
| 수수료 환산 힌트(1만원 결제 시) | `PercentInput` 자체 기능 — 기존 inputs 테스트 유지 | 변동 없음 |
| confirm 다이얼로그 열림/취소/확인 | `BidWizard.test`(확인) + **취소 이관** | 이관 |

- [ ] **Step 3: 미커버 케이스를 `BidWizard.test.tsx` 에 이관(RED→GREEN)**

`feeInput` 헬퍼(BidForm.test 82–85줄 패턴)와 함께 다음을 `BidWizard.test.tsx` 에 추가. 먼저 RED(아직 위저드 동작이 일부 누락이면) 확인 후, BidWizard가 이미 로직을 옮겼으므로 대부분 바로 GREEN이어야 한다. **GREEN이 즉시 뜨면 그 테스트는 가짜가 아님을 확인**하기 위해 해당 동작을 일시 주석 처리해 RED를 본 뒤 되돌린다.

```tsx
// BidWizard.test.tsx 에 추가 — 라벨↔input aria 연결이 없으므로 컨테이너로 input 탐색
function feeInput(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.closest('.space-y-1')!.querySelector('input[type="number"]') as HTMLInputElement;
}
const draftV2 = (fees: Record<string, string>, memo = '') => ({
  __v: 2, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees, memo,
});

describe('BidWizard 드래프트 복원(1단계)', () => {
  it('드래프트 없으면 복원 배너 없음', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.queryByText(/이전에 작성 중이던 내용/)).toBeNull();
  });
  it('드래프트 있으면 배너 표시 + 불러오기 시 값 반영', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV2({ card: '0.40' }, '복원됨')));
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '불러오기' }));
    expect(screen.queryByText(/이전에 작성 중이던 내용/)).toBeNull();
    // step2 로 이동해 카드 수수료 0.40 확인
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(feeInput('카드 수수료').value).toBe('0.40');
  });
  it('무시 클릭 시 배너 사라지고 localStorage 제거', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV2({ card: '0.50' })));
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '무시' }));
    expect(localStorage.getItem('bid-draft:rfp-uuid')).toBeNull();
  });
});

describe('BidWizard 413 업로드 오류(3단계)', () => {
  it('413 응답 시 파일 크기 오류 메시지', async () => {
    // 주: 파일 상단 http mock 을 BidForm.test 처럼 추가 — vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }))
    // 그리고 HTTPError(413) 를 던지도록 설정. step3 로 이동 후 업로드.
    // (구현 셀렉터는 BidForm.test 116–134줄 패턴을 그대로 차용)
  });
});

describe('BidWizard 템플릿 적용(1단계)', () => {
  it('템플릿 선택 시 정산주기 + 요청 결제수단 요율 채움', async () => {
    const user = userEvent.setup();
    render(
      <BidWizard
        rfp={rfp}
        buyerName="토스"
        templates={[{ id: 't1', name: '표준', settleCycle: 'M+2', settleLimit: 0, guaranteeInsurance: 0, paymentFees: { card: 0.005 } }]}
      />,
    );
    await user.selectOptions(screen.getByRole('option', { name: '표준' }).closest('select')!, 't1');
    expect((screen.getByPlaceholderText('1') as HTMLInputElement).value).toBe('2');
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(feeInput('카드 수수료').value).toBe('0.5');
  });
});
```

> 413 케이스는 `http` mock 의존 — `BidWizard.test.tsx` 상단에 `vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }))` + `vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')))` 를 추가하고 BidForm.test 116–134줄을 그대로 이식. paymentFees/customFees 분리(커스텀 c1) 제출 케이스도 BidForm.test 165–185줄을 `customPaymentMethods: [{id:'c1',label:'포인트결제'}]` 로 BidWizard에 이식.

각 이관 테스트 RED→GREEN 확인:
Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS.

- [ ] **Step 4: BidForm 삭제**

```bash
git rm components/inbox/BidForm.tsx components/inbox/__tests__/BidForm.test.tsx
```

- [ ] **Step 5: 전체 그린 + 타입 확인**

Run: `pnpm test components/inbox`
Expected: PASS.
Run: `pnpm tsc --noEmit 2>&1 | grep -i bidform`
Expected: 출력 없음(잔존 참조 없음).

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor(inbox): BidForm 제거 — 위저드로 완전 대체"
```

---

## Phase 5 — 목록 화면 정돈

### Task 13: `OpportunityList` 행 위계 정돈

설계 §3.1: 1차 라인 `구매사명 · 제목`, 2차 라인 `결제수단 · 상품`, 우측 마감 `D-n` 칩 + 단일 CTA. 견적번호·홈페이지는 강등(2차 라인 끝, 작게).

**Files:**
- Modify: `components/opportunities/OpportunityList.tsx`
- Test: `components/opportunities/__tests__/OpportunityList.test.tsx` (없으면 생성)

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/opportunities/__tests__/OpportunityList.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { OpportunityListing } from '@/lib/types/pg-request';

vi.mock('../OpportunityRequestDialog', () => ({
  OpportunityRequestDialog: () => <button>참여 요청</button>,
}));

import { OpportunityList } from '../OpportunityList';

afterEach(cleanup);

const item: OpportunityListing = {
  rfpCode: 'P-2606-0001',
  buyerName: '토스페이먼츠',
  title: '구독 커머스 PG 견적',
  websiteUrl: 'https://toss.im',
  deadline: new Date(Date.now() + 2 * 864e5).toISOString(),
  requiredPaymentMethods: ['card'],
  customPaymentMethodLabels: [],
  mainProducts: '구독',
} as OpportunityListing;

describe('OpportunityList', () => {
  it('구매사명과 제목을 1차 정보로 보여준다', () => {
    render(<OpportunityList items={[item]} />);
    expect(screen.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText('구독 커머스 PG 견적')).toBeInTheDocument();
  });

  it('마감 D-n 칩을 보여준다 (D-2)', () => {
    render(<OpportunityList items={[item]} />);
    expect(screen.getByTestId('deadline-chip')).toHaveTextContent('D-2');
  });

  it('행마다 참여 요청 CTA 하나', () => {
    render(<OpportunityList items={[item]} />);
    expect(screen.getAllByRole('button', { name: '참여 요청' })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/opportunities/__tests__/OpportunityList.test.tsx`
Expected: FAIL — `deadline-chip` testid 없음.

- [ ] **Step 3: 구현 — 행 마크업 교체**

`OpportunityList.tsx` 의 `<li>` 블록(35–80줄)을 다음으로 교체. (상단 import 에 `formatDeadline` 유지, `formatDate` 는 2차 라인에서 계속 사용.)

```tsx
            <li
              key={it.rfpCode}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">{it.buyerName}</span>
                  <span className="mx-1.5 text-[var(--md-sys-color-outline-variant)]">·</span>
                  {it.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  {paymentLabels.length > 0 && <span className="truncate">{paymentLabels.join(' · ')}</span>}
                  {it.mainProducts && <span className="truncate">{it.mainProducts}</span>}
                  {it.websiteUrl && (
                    <a
                      href={it.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[var(--md-sys-color-primary)] hover:underline"
                    >
                      {it.websiteUrl.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  <span className="md-numeric text-[var(--md-sys-color-outline)]">{it.rfpCode}</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <DeadlineChip deadline={it.deadline} />
                <OpportunityRequestDialog rfpCode={it.rfpCode} />
              </div>
            </li>
```

파일 상단(컴포넌트 함수 위)에 공유 `DeadlineChip` 추가:

```tsx
function DeadlineChip({ deadline }: { deadline: string }) {
  const d = formatDeadline(deadline); // 예: "D-2" | "D-day" | "마감"
  const urgent = d.startsWith('D-') && parseInt(d.slice(2)) <= 3;
  return (
    <span
      data-testid="deadline-chip"
      className={cn(
        'md-numeric rounded-full px-2 py-0.5 text-[10px] font-semibold',
        urgent
          ? 'bg-[color-mix(in_srgb,var(--md-sys-color-error)_16%,transparent)] text-[var(--md-sys-color-error)]'
          : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]',
      )}
    >
      {d}
    </span>
  );
}
```

import 에 `cn` 추가: `import { cn } from '@/lib/utils';`

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/opportunities/__tests__/OpportunityList.test.tsx`
Expected: PASS (3). (`formatDeadline` 의 실제 출력 포맷이 `D-2` 형태인지 `lib/format.ts` 에서 확인 — 다르면 테스트의 기대 문자열을 실제 포맷에 맞춘다.)

- [ ] **Step 5: 커밋**

```bash
git add components/opportunities/OpportunityList.tsx components/opportunities/__tests__/OpportunityList.test.tsx
git commit -m "feat(opportunities): 행 위계 정돈 + 마감 D-n 칩"
```

---

### Task 14: `InboxList` 상태 강조 + 행당 1차 행동

설계 §3.2: `신규` 상태가 시각적으로 가장 강함, 마감 임박 빨강 유지, 행당 1차 행동(신규→견적 작성 / 보낸 것→보낸 견적). 행 전체 클릭(peek)은 유지하고, 행동 버튼은 전체 상세로 이동(click 전파 차단).

**Files:**
- Modify: `components/inbox/InboxList.tsx`
- Test: `components/inbox/__tests__/InboxList.test.tsx` (없으면 생성)

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/inbox/__tests__/InboxList.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { InboxRow } from '../InboxList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

import { InboxList } from '../InboxList';

afterEach(cleanup);

const row = (over: Partial<InboxRow>): InboxRow => ({
  invitationId: 'inv-1',
  invitationStatus: 'sent',
  rfpStatus: 'sent',
  rfpId: 'P-2606-0001',
  rfpTitle: '정기결제 PG 견적',
  rfpDeadline: new Date(Date.now() + 1 * 864e5).toISOString(),
  grade: 'A',
  ...over,
});

describe('InboxList', () => {
  it('신규(sent) 행은 "견적 작성" 행동을 보여준다', () => {
    render(<InboxList rows={[row({ invitationStatus: 'sent' })]} />);
    expect(screen.getByRole('link', { name: '견적 작성' })).toHaveAttribute('href', '/inbox/P-2606-0001');
  });

  it('견적 보낸(accepted) 행은 "보낸 견적" 행동을 보여준다', () => {
    render(<InboxList rows={[row({ invitationStatus: 'accepted' })]} />);
    expect(screen.getByRole('link', { name: '보낸 견적' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/__tests__/InboxList.test.tsx`
Expected: FAIL — 행동 링크 없음.

- [ ] **Step 3: 구현 — 행동 컬럼 추가**

`InboxList.tsx`:
- 상단 import 에 `Link` 추가: `import Link from 'next/link';`
- `<thead>` 의 마지막 `<th>상태</th>` 다음에 행동 헤더 추가:

```tsx
            <th className="px-3 py-3 text-right font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">행동</th>
```

- 상태 `<td>`(101–106줄, Chip) 다음에 행동 `<td>` 추가. `accepted` 면 '보낸 견적'(보조 text), 그 외(신규/sent·opened)면 '견적 작성'(1차):

```tsx
                <td className="px-3 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  {row.invitationStatus === 'accepted' ? (
                    <Link
                      href={`/inbox/${row.rfpId}/submitted`}
                      className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
                    >
                      보낸 견적
                    </Link>
                  ) : row.invitationStatus === 'declined' || row.invitationStatus === 'expired' ? (
                    <span className="font-mono text-[11px] text-[var(--md-sys-color-outline)]">—</span>
                  ) : (
                    <Link
                      href={`/inbox/${row.rfpId}`}
                      className="inline-flex items-center rounded-[6px] bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
                    >
                      견적 작성
                    </Link>
                  )}
                </td>
```

> 행동 셀의 `stopPropagation` 으로 행 클릭(peek)과 분리. Skeleton(`InboxListSkeleton`)의 `<thead>`/행에도 빈 `<th>`/`<td>` 한 칸 추가해 열 수를 맞춘다.

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/__tests__/InboxList.test.tsx`
Expected: PASS (2).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/InboxList.tsx components/inbox/__tests__/InboxList.test.tsx
git commit -m "feat(inbox): 수신함 행당 1차 행동(견적 작성/보낸 견적) 추가"
```

---

## Phase 6 — 완료 화면 정돈

### Task 15: `SubmittedSummary` (접히는 견적 요약 클라이언트 컴포넌트)

설계 §4: 메시지·다음행동 지배, 견적 요약은 기본 접힘. 요약 행 생성은 서버 페이지에서 계산해 prop으로 넘긴다(클라이언트는 토글만).

**Files:**
- Create: `components/inbox/SubmittedSummary.tsx`
- Test: `components/inbox/__tests__/SubmittedSummary.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// components/inbox/__tests__/SubmittedSummary.test.tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmittedSummary } from '../SubmittedSummary';

afterEach(cleanup);

const rows: [string, string][] = [
  ['정산 주기', 'D+1'],
  ['정산한도', '₩1,000,000'],
];

describe('SubmittedSummary', () => {
  it('기본은 접혀 있어 값이 보이지 않는다', () => {
    render(<SubmittedSummary rows={rows} />);
    expect(screen.queryByText('D+1')).not.toBeInTheDocument();
  });

  it('"보낸 내용 보기" 클릭 시 펼쳐진다', async () => {
    const user = userEvent.setup();
    render(<SubmittedSummary rows={rows} />);
    await user.click(screen.getByRole('button', { name: /보낸 내용 보기/ }));
    expect(screen.getByText('D+1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/__tests__/SubmittedSummary.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// components/inbox/SubmittedSummary.tsx
'use client';

import { useState } from 'react';

export function SubmittedSummary({ rows }: { rows: [string, string][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
      >
        보낸 내용 보기 {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-3 divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {rows.map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
              <span className="font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)]">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/__tests__/SubmittedSummary.test.tsx`
Expected: PASS (2).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/SubmittedSummary.tsx components/inbox/__tests__/SubmittedSummary.test.tsx
git commit -m "feat(inbox): 완료 화면 접히는 요약 컴포넌트"
```

---

### Task 16: 완료 페이지에 메시지 지배 + 접힘 요약 적용

**Files:**
- Modify: `app/(app)/inbox/[rfpId]/submitted/page.tsx`

- [ ] **Step 1: 구현** (RSC shell — TDD 면제 대상: 단순 조립 + 데이터 매핑. 단위 검증은 Task 15 컴포넌트가 담당.)

`submitted/page.tsx` 의 `return (...)`(62–144줄)을 교체. RFP/Bid 요약 섹션을 하나의 접힘 요약으로 통합하고, 메시지 + 다음 행동(수신함으로)을 지배적으로 배치:

```tsx
  const bidRows: [string, string][] = [
    ['견적 요청 번호', rfp.code],
    ['제목', rfp.title],
    ['등급', grade ? GRADE_LABELS[grade] : '—'],
    ['마감', formatDate(rfp.deadline)],
    ['정산 주기', bid.settleCycle],
    ['정산한도', formatKRW(bid.settleLimit)],
    ['월 보증보험', formatKRW(bid.guaranteeInsurance)],
    ...Object.entries(bid.paymentFees).map(
      ([m, fee]) => [PAYMENT_METHOD_LABELS[m as PaymentMethod], formatPct(fee as number)] as [string, string],
    ),
    ...Object.entries(bid.customFees).map(([id, fee]) => {
      const label = rfp.customPaymentMethods.find((c) => c.id === id)?.label ?? id;
      return [label, formatPct(fee)] as [string, string];
    }),
  ];

  return (
    <div className="px-8 py-16 max-w-2xl mx-auto">
      {/* 메시지 지배 */}
      <div className="text-center">
        <div className="text-[32px] leading-none text-[var(--md-sys-color-tertiary)]">✓</div>
        <h1 className="mt-3 text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          견적을 보냈어요
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          구매사가 마감일까지 비교·검토 후 결과를 알려드려요.
        </p>
        {bid.submittedAt && (
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            보낸 시각 <LocalTime iso={bid.submittedAt} />
          </p>
        )}
      </div>

      {/* 다음 행동 1개 (1차) + 보조 */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          href="/inbox"
          className="inline-flex items-center rounded-[6px] bg-[var(--md-sys-color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
        >
          수신함으로
        </Link>
      </div>

      {/* 요약은 접힘 */}
      <div className="mt-10">
        <SubmittedSummary rows={bidRows} />
      </div>
    </div>
  );
```

상단 import 에 추가: `import { SubmittedSummary } from '@/components/inbox/SubmittedSummary';`
(`bid` 없을 때의 early-return 블록 44–58줄은 그대로 유지.)

- [ ] **Step 2: 통합 확인** — 페이지 컴파일 + 기존 e2e/유닛 회귀.

Run: `pnpm tsc --noEmit 2>&1 | grep -i submitted`
Expected: 출력 없음.
Run: `pnpm test components/inbox/__tests__/SubmittedSummary.test.tsx`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add "app/(app)/inbox/[rfpId]/submitted/page.tsx"
git commit -m "feat(inbox): 완료 화면 메시지 지배 + 요약 접힘"
```

---

## Phase 7 — 최종 검증

### Task 17: 전체 health 스택 + 시각 확인

- [ ] **Step 1: 전체 테스트**

Run: `pnpm test`
Expected: 전부 PASS. (PGlite 메모리 이슈로 느리면 메모리 노트대로 단일 프로젝트로 분리 실행.)

- [ ] **Step 2: 타입체크**

Run: `pnpm tsc --noEmit`
Expected: PASS. (메모리 노트: wizard test globals 관련 기존 RED 라인은 무관 — `grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"` 로 필터해 신규 에러만 확인.)

- [ ] **Step 3: 린트**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: 수동 시각 확인 (회귀 대체 아님 — 보완)**

로컬에서 PG로 로그인(`ws-toss-admin@example.com` / `password123`, 메모리: 라이브 브라우저 QA 노트), `/inbox` → 신규 RFP 행 '견적 작성' → 위저드 4단계 통과 → 발송 → `/submitted` 확인. `/opportunities` 행 위계·D-n 칩 확인.

- [ ] **Step 5: `/ship` 으로 PR**

```
/ship
```

---

## Self-Review 결과 (작성자 점검)

- **Spec 커버리지**:
  - §1 북극성(아키타입별 강조) → 목록(Task 13·14), 위저드(Task 5–10), 완료(Task 15·16). 전 화면 D-n 칩 통일 → Task 13(opp) + 14(inbox, 기존 빨강 유지) + `DeadlineChip` 패턴.
  - §2 위저드(4단계·파워유저 보호·밀집요소 5종·컨텍스트 strip) → Task 1·5·6·7·8·9·10. 템플릿 불러오기=1단계(Task 10), 저장=4단계(Task 8), 초안배너=1단계 1회(Task 10), 수수료 전용 2단계(Task 6), 비가역 경고=4단계(Task 8), 컨텍스트 strip(Task 9).
  - §2.2 자유점프/자동저장 → Task 10(goToStep + useBidDraft 이관) + Task 2·3(사이드바/진행바 클릭).
  - §3 목록 정돈 → Task 13·14. §4 완료 정돈 → Task 15·16.
  - §5 디자인 정합(D-n 칩·✓ 배지의 shape-full 예외) → Task 13 `DeadlineChip`(rounded-full) + Task 16(✓). §6 영향 컴포넌트 표 → 전부 task 존재.
  - §7 열린 항목(견적서 단계 선택 정책) → Task 1 검증에서 step3=항상 complete + submit 게이트는 step1·2(canSubmit)로 해소.
- **렌더 컨텍스트(advisor #1, 해결)**: `PgRfpDetailContent` 는 전체 페이지 + InboxPeekPanel 오버레이 둘 다에서 렌더 → Task 11에서 `variant` 분기(peek=브리프+'견적 작성 →' CTA, full=위저드). peek 기본값으로 기존 호출부 무수정.
- **BidForm.test 이관(advisor #2, 해결)**: Task 12에 케이스 매핑 표 + 미커버(413 매핑·드래프트 복원/무시·템플릿 적용·confirm 취소·customFees 분리)를 BidWizard.test로 이관하는 step 추가. "동등 가정"으로 삭제하지 않음.
- **진짜 RED(advisor #3, 해결)**: Task 11 RED 신호를 CSS 클래스 부재 대신 위저드 전용 라벨 `검토·발송`(BidForm 미렌더) 존재로 변경.
- **승인 목업 정합(advisor #4, 해결)**: `savedAt` 자동저장 표시를 컨텐츠 영역 → 사이드바 footer(`WizardStepSidebar` 의 `footer` prop)로 이동.
- **Placeholder 스캔**: 모든 코드 step에 완전 코드 포함. "주"는 셀렉터 검증 안내이지 미완 코드 아님. (Task 12 Step 3의 413 케이스만 셀렉터를 BidForm.test 줄번호로 참조 — 이식 시 그대로 복사.)
- **타입 일관성**: `SetBidField`(types.ts)·`BidDraft`(useBidDraft)·`ProposalState`(BidStepProposal export)·`QuoteTemplateOption`(Task 12에서 types.ts로 이전) — Task 5–12 전반에서 동일 시그니처 사용. `getBidWizardValidity` 입력 `{cycleNum, anyFeeFilled}` 가 Task 1 정의와 Task 10 호출에서 일치.
- **위험/확인 필요(실행 중 검증)**: ① `PercentInput` 의 label-input 연결 방식(getByLabelText vs getByRole) — Task 6·10 주석에 대체안. ② `formatDeadline` 실제 출력 포맷(`D-2` 가정) — Task 13에서 확인. ③ `RfpBriefPanel` prop 이름 — Task 9에서 확인. ④ `Button` 의 `icon`/`trailingIcon` prop 존재(레퍼런스 기준 존재) — 없으면 children 으로 화살표 인라인.
