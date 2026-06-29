# 견적(bid) 작성 실시간 검증 피드백 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG 견적 작성 위저드에서 입력이 안 맞아 제출이 막힐 때 즉시·구체적인 피드백(어느 필드가 왜)을 주고, 범위 밖 값은 애초에 입력되지 않게 한다.

**Architecture:** 구매사 RFP 작성 위저드(`RfpCreateWizard` + `RfpStep2Content` + `lib/rfp/required-fields.ts`)가 이미 쓰는 검증 패턴 — `markerState`/`RequiredMark`/`FieldError`, `failedSteps→failedAt` 오류 점, submit-bounce, `isAllowed` 상한 — 을 견적 위저드(`components/inbox/bid-wizard/**`)로 포팅한다. 검증의 단일 출처는 기존 `bid-wizard-validation.ts`를 확장해 유지한다. 서버/DB 변경 없음.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict / Vitest + Testing Library + userEvent / `react-number-format` / Tailwind v4 (Linear 토큰).

설계 스펙: `docs/superpowers/specs/2026-06-29-bid-wizard-validation-feedback-design.md`

## Global Constraints

- **TDD 필수 (RED→GREEN→REFACTOR)**: 모든 단계는 실패하는 테스트 먼저. RED를 직접 확인한 뒤 최소 구현. (CLAUDE.md "TDD — Hard Rules")
- **단일 파일 테스트**: `pnpm test <path>` 로 RED/GREEN 확인. 전체 그린은 마지막에 `pnpm test`.
- **헬스**: 완료 후 `pnpm tsc --noEmit` 0, `pnpm lint` 0.
- **추가되는 컴포넌트 prop은 전부 optional** → 기존(특히 구매사) 호출부 무변경. 구매사 RFP 위저드 파일은 건드리지 않는다.
- **DDL/서버 변경 0**: 서버는 trust boundary로 그대로 둔다. 클라 검증을 서버 스키마(요율 0~1, 가상계좌 정수 ≤100,000)에 맞춘다.
- **디자인 토큰 준수**: 에러는 `FieldError`(빨강 `role="alert"`), 필수 표시는 `RequiredMark` 칩(기존 컴포넌트 재사용). 새 시각 컴포넌트 금지.
- **커밋 메시지**: 한국어 conventional commits. 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 추가. ⚠️ 이 레포에는 작업 편집을 자동 커밋하는 stop-hook이 있다 — 커밋 단계 후 `git log --oneline -1` 로 실제 커밋·메시지를 확인하고, 어긋나면 isolated 브랜치에서 `git commit --amend` 로 정정한다.

---

### Task 1: 검증 SSOT — `isCycleValid` 순수 함수 추출/노출

정산주기 유효성 판정을 단일 함수로 추출해 단계 완료 판정과 필드 마커가 같은 출처를 쓰게 한다.

**Files:**
- Modify: `components/inbox/bid-wizard/bid-wizard-validation.ts`
- Test: `components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts`

**Interfaces:**
- Produces: `export function isCycleValid(cycleNum: string): boolean` — `cycleNum !== '' && parseInt(cycleNum) > 0`. (Task 4가 BidStepSettlement 마커 계산에 소비.)

- [ ] **Step 1: 실패 테스트 작성**

`bid-wizard-validation.test.ts` 상단 import에 `isCycleValid` 추가하고, 파일 끝에 추가:

```ts
import {
  getBidWizardValidity,
  getFirstIncompleteBidStep,
  isCycleValid,
} from '../bid-wizard-validation';

// ...기존 describe들 아래에 추가...

describe('isCycleValid', () => {
  it('빈 문자열은 무효', () => {
    expect(isCycleValid('')).toBe(false);
  });
  it('0 이하는 무효', () => {
    expect(isCycleValid('0')).toBe(false);
  });
  it('양의 정수는 유효', () => {
    expect(isCycleValid('3')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts`
Expected: FAIL — `isCycleValid` is not exported / not a function.

- [ ] **Step 3: 최소 구현**

`bid-wizard-validation.ts`에 함수를 추가하고 `isStepComplete` case 1이 이를 쓰게 한다:

```ts
export function isCycleValid(cycleNum: string): boolean {
  return cycleNum !== '' && parseInt(cycleNum) > 0;
}

function isStepComplete(num: number, input: BidValidationInput): boolean {
  switch (num) {
    case 1:
      return isCycleValid(input.cycleNum);
    case 2:
      return input.anyFeeFilled;
    default:
      return true;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts`
Expected: PASS (기존 6 + 신규 3).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/bid-wizard-validation.ts components/inbox/bid-wizard/__tests__/bid-wizard-validation.test.ts
git commit -m "refactor(bid-wizard): isCycleValid 순수 함수 추출 (검증 SSOT)"
```

---

### Task 2: 공유 입력 확장 — `max` 상한 + `DayOffsetInput` 마커/에러

`react-number-format`의 `isAllowed`로 상한을 강제하고, `DayOffsetInput`에 필수 마커·에러 슬롯을 단다(`CurrencyInput`이 이미 가진 패턴 미러).

**Files:**
- Modify: `components/forms/inputs.tsx`
- Test: `components/forms/__tests__/inputs.test.tsx`

**Interfaces:**
- Produces:
  - `PercentInput` / `CurrencyInput` props에 `max?: number` 추가 — 제공되면 `isAllowed`로 그 값 초과 입력을 거부.
  - `FeeRateCell` props에 `max?: number` 추가 — 동일.
  - `DayOffsetInput` props에 `markerState?: MarkerState`, `error?: string` 추가 — `RequiredMark` 칩 + `FieldError` 렌더.
- Consumes: `MarkerState`, `RequiredMark`, `FieldError` — `inputs.tsx`에 이미 import되어 있음(추가 import 불필요).

- [ ] **Step 1: 실패 테스트 작성**

`inputs.test.tsx`에 추가(각 describe 안 또는 새 describe):

```ts
// describe('PercentInput', ...) 안에 추가
it('max 초과 값은 입력되지 않는다 (isAllowed 상한)', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<PercentInput label="수수료" value="" onChange={onChange} max={100} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  await user.type(input, '150'); // 1→"1", 5→"15", 0→"150"(>100 거부)
  expect(input.value).toBe('15');
  expect(onChange).not.toHaveBeenCalledWith('150');
});

// describe('CurrencyInput', ...) 안에 추가
it('max 초과 금액은 입력되지 않는다 (isAllowed 상한)', async () => {
  const user = userEvent.setup();
  render(<CurrencyInput label="가상계좌 건당 수수료" value="" onChange={() => {}} max={100000} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  await user.type(input, '150000'); // 15000 까지 허용, 6번째 0(150000>100000) 거부
  expect(input.value).toBe('15,000');
});

// describe('FeeRateCell', ...) 안에 추가
it('max 초과 값은 입력되지 않는다 (isAllowed 상한)', async () => {
  const user = userEvent.setup();
  render(<FeeRateCell value="" onChange={() => {}} testId="c" max={100} />);
  const input = screen.getByTestId('c') as HTMLInputElement;
  await user.type(input, '150');
  expect(input.value).toBe('15');
});

// describe('DayOffsetInput', ...) 안에 추가
it('markerState="empty" 이면 "필수" 칩을 렌더한다', () => {
  render(<DayOffsetInput label="정산 주기" value="" onChange={() => {}} markerState="empty" />);
  expect(screen.getByText('필수')).toBeInTheDocument();
});
it('markerState 미전달이면 칩을 렌더하지 않는다 (회귀)', () => {
  render(<DayOffsetInput label="정산 주기" value="" onChange={() => {}} />);
  expect(screen.queryByText('필수')).toBeNull();
  expect(screen.queryByText('입력 완료')).toBeNull();
});
it('error 가 있으면 에러 메시지를 alert 로 렌더한다', () => {
  render(<DayOffsetInput label="정산 주기" value="" onChange={() => {}} error="정산 주기를 입력해주세요" />);
  expect(screen.getByRole('alert')).toHaveTextContent('정산 주기를 입력해주세요');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test components/forms/__tests__/inputs.test.tsx`
Expected: FAIL — `max` 미적용으로 값이 '150'/'150,000'; `DayOffsetInput` 칩/alert 없음.

- [ ] **Step 3: 최소 구현**

`inputs.tsx` 수정.

(a) `NumericFieldProps`에 `max?` 추가:

```ts
type NumericFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 라벨 옆에 ⓘ 설명 아이콘을 붙일 용어집 키 (예: '정산한도') */
  infoTerm?: string;
  /** 전달 시 이 값을 초과하는 입력을 isAllowed 로 거부 (예: 수수료 % 상한 100). */
  max?: number;
};
```

(b) `PercentInput`: `max`를 구조분해에 추가하고 NumericFormat에 `isAllowed` 적용:

```tsx
export function PercentInput({
  label,
  value,
  onChange,
  placeholder = '0.00',
  infoTerm,
  max,
}: NumericFieldProps) {
  const rate = formatRatePerManwon(parseFloat(value));
  const hint = rate ? `= ${rate}` : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label size="md" muted={false}>{label}</Label>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div className="flex items-end gap-1">
        <NumericFormat
          decimalScale={2}
          allowNegative={false}
          isAllowed={max === undefined ? undefined : ({ floatValue }) => floatValue === undefined || floatValue <= max}
          value={value}
          onValueChange={(values) => onChange(values.value)}
          placeholder={placeholder}
          className={cn(numericInputClass, 'flex-1')}
        />
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)] pb-2">%</span>
      </div>
      {hint && (
        <p className="font-mono text-[11px] text-[var(--md-sys-color-tertiary)] mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}
```

(c) `FeeRateCellProps`에 `max?: number` 추가, 구조분해 + NumericFormat에 `isAllowed`:

```tsx
type FeeRateCellProps = {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
  ariaLabel?: string;
  tooltipAlign?: 'start' | 'center' | 'end';
  /** 전달 시 이 값을 초과하는 입력을 거부 (수수료 % 상한 100). */
  max?: number;
};
```
`FeeRateCell` 본문의 `<NumericFormat ...>`에 한 줄 추가:
```tsx
        isAllowed={max === undefined ? undefined : ({ floatValue }) => floatValue === undefined || floatValue <= max}
```
(구조분해 `{ value, onChange, testId, ariaLabel, tooltipAlign = 'center', max }` 로 `max` 추가.)

(d) `CurrencyInput`: `max`를 구조분해(`CurrencyInputProps`는 `NumericFieldProps & {...}` 이므로 `max` 이미 타입에 포함)에 추가하고 NumericFormat에 `isAllowed`:
```tsx
        <NumericFormat
          thousandSeparator=","
          decimalScale={0}
          allowNegative={false}
          isAllowed={max === undefined ? undefined : ({ floatValue }) => floatValue === undefined || floatValue <= max}
          value={value}
          onValueChange={(values) => onChange(values.value)}
          placeholder={placeholder}
          className={cn(numericInputClass, 'flex-1')}
        />
```
(구조분해에 `max` 추가: `{ label, value, onChange, placeholder = '0', infoTerm, markerState, error, max }`.)

(e) `DayOffsetInput`: 전용 props 타입 + 마커/에러 렌더:
```tsx
type DayOffsetInputProps = NumericFieldProps & {
  /** 전달 시 라벨 옆에 필수 마커 칩을 렌더. */
  markerState?: MarkerState;
  /** 전달 시 하단에 에러 메시지를 렌더. */
  error?: string;
};

export function DayOffsetInput({
  label,
  value,
  onChange,
  placeholder = '0',
  infoTerm,
  markerState,
  error,
}: DayOffsetInputProps) {
  const [type, setType] = useState<string>(() => value.match(/^[DWM]/)?.[0] ?? 'D');
  const numeric = value.match(/\d+/)?.[0] ?? '';

  function emit(t: string, n: string) {
    onChange(n ? formatSettleCycle(t as 'D' | 'W' | 'M', Number(n)) : '');
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Label size="md" muted={false}>{label}</Label>
          {infoTerm && <InfoTip term={infoTerm} />}
        </div>
        {markerState && <RequiredMark state={markerState} />}
      </div>
      <div className="flex items-center gap-1">
        <Select
          options={CYCLE_TYPE_OPTIONS}
          value={type}
          onChange={(t) => { setType(t); emit(t, numeric); }}
          className="w-[100px] h-8 text-[13px]"
        />
        <span className="font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)]">+</span>
        <NumericFormat
          decimalScale={0}
          allowNegative={false}
          value={numeric}
          onValueChange={(values) => emit(type, values.value)}
          placeholder={placeholder}
          className={cn(numericInputClass, 'flex-1')}
        />
      </div>
      <FieldError error={error} />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/forms/__tests__/inputs.test.tsx`
Expected: PASS (기존 + 신규 6).

- [ ] **Step 5: 커밋**

```bash
git add components/forms/inputs.tsx components/forms/__tests__/inputs.test.tsx
git commit -m "feat(inputs): max isAllowed 상한 + DayOffsetInput 마커/에러 슬롯"
```

---

### Task 3: BidWizard 보내기 게이트 — 침묵 금지 + bounce + 오류 점 (Mode A)

`견적 보내기`를 입력 미충족으로 비활성화하지 않는다. 누르면 첫 미충족 단계로 이동 + hint 토스트 + 그 단계에 빨간 오류 점.

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

**Interfaces:**
- Consumes: `getFirstIncompleteBidStep`(기존), `toast`(기존), `BID_WIZARD_STEPS`(기존), `WizardStepSidebar`/`WizardProgressBar`의 `failedAt?: boolean[]` prop(기존 지원).
- Produces: BidWizard 내부에 `failedSteps: Set<number>`, `markFailed(n)`, `failedAt: boolean[]`. (Task 4·5·6이 `markFailed`/`failedSteps`/`setCurrentStep` 소비.)

- [ ] **Step 1: 실패 테스트 작성 (+ 기존 stale 테스트 교체)**

`BidWizard.test.tsx`의 `describe('BidWizard 네비게이션 푸터', ...)` 안의 기존 `it('4단계: 수수료 미입력 시 견적 보내기 비활성', ...)` 를 **삭제하고** 아래로 교체:

```ts
it('4단계: 수수료 미입력 시 견적 보내기는 비활성이 아니라, 누르면 수수료 단계로 이동·안내', async () => {
  const user = userEvent.setup();
  render(<BidWizard rfp={rfp} buyerName="토스" />); // cycleNum 기본 '1'(유효) → 첫 미충족 = 수수료(2단계)
  await user.click(screen.getByRole('button', { name: '수수료' }));
  await user.click(screen.getByRole('button', { name: '견적서' }));
  await user.click(screen.getByRole('button', { name: '검토·발송' }));

  const footer = screen.getByTestId('wizard-nav-footer');
  const sendBtn = within(footer).getByRole('button', { name: '견적 보내기' });
  expect(sendBtn).not.toBeDisabled();

  await user.click(sendBtn);
  // 수수료(2단계)로 이동 → 수수료 카운터가 보인다
  expect(screen.getByTestId('fees-count')).toBeInTheDocument();
  // 안내 토스트
  expect(toast).toHaveBeenCalledWith(
    expect.stringContaining('수수료'),
    expect.objectContaining({ type: 'error' }),
  );
  // 제출 다이얼로그는 열리지 않는다
  expect(submitBidMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: FAIL — 현재 버튼이 `disabled`라 `not.toBeDisabled()` 또는 클릭 후 이동/토스트가 일어나지 않음.

- [ ] **Step 3: 최소 구현**

`BidWizard.tsx` 수정.

(a) import에 `getFirstIncompleteBidStep`는 이미 있음. state·파생값 추가 (예: `submitError` state 근처):
```tsx
  const [failedSteps, setFailedSteps] = useState<Set<number>>(new Set());
  const markFailed = useCallback(
    (n: number) => setFailedSteps((prev) => { const next = new Set(prev); next.add(n); return next; }),
    [],
  );
  const failedAt = BID_WIZARD_STEPS.map((s) => failedSteps.has(s.num));
```

(b) `handleSubmit`에 toast + markFailed 추가:
```tsx
  const handleSubmit = useCallback(() => {
    const incomplete = getFirstIncompleteBidStep({ cycleNum, anyFeeFilled });
    if (incomplete) {
      toast(incomplete.hint, { type: 'error' });
      markFailed(incomplete.num);
      setCurrentStep(incomplete.num);
      return;
    }
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  }, [cycleNum, anyFeeFilled, markFailed]);
```

(c) 발송 버튼 `disabled` 식 교체 (현재 `disabled={!canSubmit}`):
```tsx
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleSubmit}
                    disabled={pending || !!proposalUploading}
                  >
                    {pending ? '보내는 중…' : '견적 보내기'}
                  </Button>
```

(d) `WizardStepSidebar`·`WizardProgressBar`에 `failedAt` 전달:
```tsx
          <WizardStepSidebar
            currentStep={currentStep}
            completed={completed}
            failedAt={failedAt}
            onStepClick={goToStep}
            steps={BID_WIZARD_STEPS}
            title="견적 작성"
            footer={ /* 기존 그대로 */ }
          />
```
```tsx
            <WizardProgressBar currentStep={currentStep} completed={completed} failedAt={failedAt} onStepClick={goToStep} steps={BID_WIZARD_STEPS} />
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS — 교체 테스트 통과 + 기존 해피패스(정상 입력 후 발송→확인) 그대로 통과.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "feat(bid-wizard): 보내기 버튼 침묵 제거 — 미충족 시 bounce+토스트+오류 점"
```

---

### Task 4: 정산주기 인라인 마커/에러 (step 1)

`failedSteps`에서 단계별 attempt 신호를 컨텍스트로 흘려, 정산주기 필드에 필수 칩 + 시도-후 빨간 에러를 보인다.

**Files:**
- Modify: `components/inbox/bid-wizard/bid-wizard-context.tsx`
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Modify: `components/inbox/bid-wizard/BidStepSettlementContainer.tsx`
- Modify: `components/inbox/bid-wizard/BidStepSettlement.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx`
- Test(수정): `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

**Interfaces:**
- Consumes: `isCycleValid`(Task 1), `DayOffsetInput`의 `markerState`/`error`(Task 2), `failedSteps`(Task 3), `markerState`/`MarkerState`(`@/lib/rfp/required-fields`), `RequiredMark`.
- Produces: `BidWizardContextValue.settlementAttempted: boolean`; `BidStepSettlement` props에 `attempted?: boolean`.

- [ ] **Step 1: 실패 테스트 작성**

`BidStepSettlement.test.tsx`의 `renderStep` 시그니처는 `Partial<ComponentProps<typeof BidStepSettlement>>` 라 새 `attempted` prop을 그대로 받는다. 아래 테스트 추가:

```ts
it('정산주기 라벨에서 임시 별표(*)를 떼고 필수 칩으로 대체한다', () => {
  renderStep({ cycleNum: '' });
  expect(screen.queryByText('정산 주기 *')).toBeNull();
  expect(screen.getByText('정산 주기')).toBeInTheDocument();
  expect(screen.getByText('필수')).toBeInTheDocument(); // 비었으므로 'empty' → '필수'
});

it('정산주기가 채워지면 "입력 완료" 칩을 보인다', () => {
  renderStep({ cycleNum: '1' });
  expect(screen.getByText('입력 완료')).toBeInTheDocument();
});

it('attempted=true 이고 정산주기가 비면 빨간 에러 메시지를 보인다', () => {
  renderStep({ cycleNum: '', attempted: true });
  expect(screen.getByRole('alert')).toHaveTextContent('정산 주기를 입력해주세요');
});

it('attempted=false 이면 비어 있어도 에러 메시지는 없다', () => {
  renderStep({ cycleNum: '' });
  expect(screen.queryByRole('alert')).toBeNull();
});
```

또한 `BidWizard.test.tsx`의 기존 `it('1단계 정산조건이 먼저 보인다 ...')`에서 `getByText('정산 주기 *')` 를 `getByText('정산 주기')` 로 수정:

```ts
  it('1단계 정산조건이 먼저 보인다 (수수료 입력칸은 2단계로 이동해야 보임)', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.getByText('정산 주기')).toBeInTheDocument();
    expect(screen.queryByText(/카드 수수료/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx`
Expected: FAIL — `정산 주기 *` 여전히 존재, 칩/alert 없음.

- [ ] **Step 3: 최소 구현**

(a) `bid-wizard-context.tsx` — `BidWizardContextValue`에 한 줄 추가(파생값 그룹):
```ts
  // 단계별 attempt 신호 — 시도(제출 bounce) 후 해당 단계 필수 필드를 빨강으로 escalate.
  settlementAttempted: boolean;
```

(b) `BidWizard.tsx` `wizardContext` useMemo에 값·deps 추가:
```tsx
      submitError,
      canSubmit,
      settlementAttempted: failedSteps.has(1),
```
deps 배열에 `failedSteps` 추가.

(c) `BidStepSettlementContainer.tsx` — 컨텍스트에서 읽어 prop으로:
```tsx
export const BidStepSettlementContainer = memo(function BidStepSettlementContainer() {
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, setField, settlementAttempted } =
    useBidWizardContext();
  return (
    <BidStepSettlement
      cycleUnit={cycleUnit}
      cycleNum={cycleNum}
      settleLimit={settleLimit}
      guaranteeInsurance={guaranteeInsurance}
      onField={setField}
      attempted={settlementAttempted}
    />
  );
});
```

(d) `BidStepSettlement.tsx` — `attempted` prop + 마커/에러 계산, 라벨 별표 제거:
```tsx
import { CurrencyInput, DayOffsetInput } from '@/components/forms/inputs';
import { formatSettleCycle } from '@/lib/utils/settle-cycle';
import { isCycleValid } from './bid-wizard-validation';
import { markerState } from '@/lib/rfp/required-fields';
import type { SetBidField } from './types';

type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  onField: SetBidField;
  /** 제출 시도 후 true — 정산주기 미입력을 빨강으로 escalate. */
  attempted?: boolean;
};

export function BidStepSettlement({
  cycleUnit,
  cycleNum,
  settleLimit,
  guaranteeInsurance,
  onField,
  attempted = false,
}: Props) {
  const cycleValue = cycleNum ? formatSettleCycle(cycleUnit, Number(cycleNum)) : '';
  const cycleValid = isCycleValid(cycleNum);

  function handleCycleChange(v: string) {
    const m = v.match(/^([DWM])\+(\d+)$/);
    if (m) {
      onField('cycleUnit', m[1] as 'D' | 'W' | 'M');
      onField('cycleNum', m[2]);
    } else {
      onField('cycleNum', '');
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <div className="col-span-2">
          <DayOffsetInput
            label="정산 주기"
            infoTerm="정산주기"
            value={cycleValue}
            onChange={handleCycleChange}
            placeholder="1"
            markerState={markerState({ valid: cycleValid, attempted })}
            error={attempted && !cycleValid ? '정산 주기를 입력해주세요' : undefined}
          />
        </div>
        <CurrencyInput
          label="정산한도 (원/월)"
          infoTerm="정산한도"
          value={settleLimit}
          onChange={(v) => onField('settleLimit', v)}
          placeholder="0"
        />
        <CurrencyInput
          label="월 보증보험 (원/연)"
          infoTerm="보증보험"
          value={guaranteeInsurance}
          onChange={(v) => onField('guaranteeInsurance', v)}
          placeholder="0"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS (settlement 신규 4 + 기존; BidWizard 라벨 수정 반영).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/bid-wizard-context.tsx components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/BidStepSettlementContainer.tsx components/inbox/bid-wizard/BidStepSettlement.tsx components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "feat(bid-wizard): 정산주기 필수 마커 + 시도-후 인라인 에러"
```

---

### Task 5: 수수료 인라인 피드백 (step 2) — 단계 메시지 + 상한 적용

수수료 0칸일 때 단계-레벨 에러를 보이고, 모든 수수료 입력에 상한(`max`)을 걸어 범위 밖 값이 서버까지 가지 못하게 한다(Mode B 원천 차단).

**Files:**
- Modify: `components/inbox/bid-wizard/bid-wizard-context.tsx`
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Modify: `components/inbox/bid-wizard/BidStepFeesContainer.tsx`
- Modify: `components/inbox/bid-wizard/BidStepFees.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`

**Interfaces:**
- Consumes: `max` 지원(Task 2), `failedSteps`(Task 3), `FieldError`(`@/components/primitives/FieldError`).
- Produces: `BidWizardContextValue.feesAttempted: boolean`; `BidStepFees` props에 `attempted?: boolean`.

- [ ] **Step 1: 실패 테스트 작성**

`BidStepFees.test.tsx`에 추가:
```ts
import { FieldError } from '@/components/primitives/FieldError'; // (불필요 시 생략 — 아래는 동작 테스트)

it('attempted=true 이고 채운 칸이 0개면 "1칸 이상" 에러를 보인다', () => {
  setup({ fees: {}, attempted: true });
  expect(screen.getByText('수수료를 1칸 이상 입력해주세요')).toBeInTheDocument();
});

it('attempted=false 이면 0칸이어도 에러가 없다', () => {
  setup({ fees: {} });
  expect(screen.queryByText('수수료를 1칸 이상 입력해주세요')).toBeNull();
});

it('attempted=true 라도 1칸 이상 채우면 에러가 사라진다', () => {
  setup({ fees: { 'card:general': '1.5' }, attempted: true });
  expect(screen.queryByText('수수료를 1칸 이상 입력해주세요')).toBeNull();
});

it('구간 셀에 100 초과 값은 입력되지 않는다 (max 상한)', async () => {
  const user = userEvent.setup();
  setup();
  const cell = screen.getByTestId('fee-cell-card-sole') as HTMLInputElement;
  await user.type(cell, '150');
  expect(cell.value).toBe('15');
});
```
(주의: `BidStepFees.test.tsx`는 `userEvent`를 아직 import하지 않으니 상단 import에 `import userEvent from '@testing-library/user-event';` 추가.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`
Expected: FAIL — 에러 메시지 없음; `cell.value` 가 '150'.

- [ ] **Step 3: 최소 구현**

(a) `bid-wizard-context.tsx` — `BidWizardContextValue`에 추가:
```ts
  feesAttempted: boolean;
```

(b) `BidWizard.tsx` `wizardContext` useMemo에 추가(값 + 이미 deps에 `failedSteps` 있음):
```tsx
      settlementAttempted: failedSteps.has(1),
      feesAttempted: failedSteps.has(2),
```

(c) `BidStepFeesContainer.tsx`:
```tsx
export const BidStepFeesContainer = memo(function BidStepFeesContainer() {
  const { feeInputMethods, customPaymentMethods, fees, setFee, feesAttempted } =
    useBidWizardContext();
  return (
    <BidStepFees
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      onFee={setFee}
      attempted={feesAttempted}
    />
  );
});
```

(d) `BidStepFees.tsx` — `attempted` prop + 단계 메시지 + 입력 상한. import 추가:
```tsx
import { FieldError } from '@/components/primitives/FieldError';
```
Props 타입에 `attempted?: boolean` 추가, 본문 상단에서 받기:
```tsx
type Props = {
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  onFee: (key: string, value: string) => void;
  /** 제출 시도 후 true — 0칸이면 단계-레벨 에러 표시. */
  attempted?: boolean;
};

export function BidStepFees({
  feeInputMethods,
  customPaymentMethods,
  fees,
  onFee,
  attempted = false,
}: Props) {
```
상단 카운터 행(`filledUnits/totalUnits`) **아래**에 에러 한 줄 추가(`return`의 첫 `<div>` 안, 카운터 `flex` 블록 바로 다음):
```tsx
      {attempted && filledUnits === 0 && (
        <FieldError error="수수료를 1칸 이상 입력해주세요" />
      )}
```
구간 셀 `FeeRateCell`에 `max={100}` 전달:
```tsx
                        <FeeRateCell
                          testId={`fee-cell-${m}-${t}`}
                          ariaLabel={`${PAYMENT_METHOD_LABELS[m]} ${MERCHANT_TIER_LABELS[t]} 수수료`}
                          value={fees[key] ?? ''}
                          onChange={(v) => onFee(key, v)}
                          tooltipAlign={tooltipAlign}
                          max={100}
                        />
```
단일요율 `PercentInput`(정률 수단·커스텀)에 `max={100}`, 정액 `CurrencyInput`(가상계좌)에 `max={100_000}`:
```tsx
            {singleMethods.map((m) =>
              isFlatFeeMethod(m) ? (
                <CurrencyInput
                  key={m}
                  label={`${PAYMENT_METHOD_LABELS[m]} 건당 수수료`}
                  value={fees[m] ?? ''}
                  onChange={(v) => onFee(m, v)}
                  max={100_000}
                />
              ) : (
                <PercentInput
                  key={m}
                  label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
                  value={fees[m] ?? ''}
                  onChange={(v) => onFee(m, v)}
                  max={100}
                />
              ),
            )}
            {customPaymentMethods.map((c) => (
              <PercentInput
                key={c.id}
                label={`${c.label} 수수료`}
                value={fees[c.id] ?? ''}
                onChange={(v) => onFee(c.id, v)}
                max={100}
              />
            ))}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`
Expected: PASS (신규 4 + 기존 그대로).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/bid-wizard-context.tsx components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/BidStepFeesContainer.tsx components/inbox/bid-wizard/BidStepFees.tsx components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx
git commit -m "feat(bid-wizard): 수수료 단계 메시지 + 입력 상한(범위 밖 값 차단)"
```

---

### Task 6: 서버 거부를 단계로 매핑 (doSubmit)

서버가 거부하면 일반 문구 대신 가능한 건 해당 단계로 이동·표시한다(구매사 `INVALID_WEBSITE→step2` 미러).

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

**Interfaces:**
- Consumes: `markFailed`/`setCurrentStep`/`setSubmitError`(Task 3, 기존), `submitBidAction` 결과.
- Produces: `doSubmit` 실패 분기의 단계 매핑(`INVALID_ATTACHMENT→3`, `PAYMENT_METHOD_NOT_REQUESTED→2`; 그 외 기존 동작 유지).

- [ ] **Step 1: 실패 테스트 작성**

`BidWizard.test.tsx`에 추가(파일 끝 새 describe). 정상 입력 후 발송→확인까지 진행하되 `submitBidMock`이 거부를 반환하도록 설정:

```ts
describe('BidWizard 서버 거부 매핑', () => {
  it('INVALID_ATTACHMENT 거부 시 견적서(3) 단계로 이동한다', async () => {
    const user = userEvent.setup();
    submitBidMock.mockResolvedValueOnce({ ok: false as const, error: 'INVALID_ATTACHMENT' });
    render(<BidWizard rfp={rfp} buyerName="토스" />); // cycleNum 기본 '1'

    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.type(screen.getByTestId('fee-cell-card-general'), '1.5');
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    // 견적서(3단계)로 이동 → 파일 입력이 보인다
    await waitFor(() =>
      expect(document.querySelector('input[type="file"]')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: FAIL — 현재는 step4에 머물며 `setSubmitError`만 함(파일 입력 안 보임).

- [ ] **Step 3: 최소 구현**

`BidWizard.tsx` `doSubmit`의 실패 분기 교체(현재 `setSubmitError(r.error); setCurrentStep(4);`). 파일 상단(컴포넌트 밖)에 매핑 상수 추가:
```tsx
// 서버 거부코드 → 그 원인이 있는 단계. 없으면 step4(검토)에서 일반 메시지.
const SERVER_ERROR_STEP: Record<string, number> = {
  PAYMENT_METHOD_NOT_REQUESTED: 2,
  INVALID_ATTACHMENT: 3,
};
```
`doSubmit` else 분기:
```tsx
      } else {
        setSubmitError(r.error);
        const step = SERVER_ERROR_STEP[r.error] ?? 4;
        if (step !== 4) markFailed(step);
        setCurrentStep(step);
      }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "feat(bid-wizard): 서버 거부를 원인 단계로 이동·표시"
```

---

### Task 7: 전체 그린 + 헬스 + 회귀 확인

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 관련 스위트 그린**

Run:
```bash
pnpm test components/inbox/bid-wizard components/forms/__tests__/inputs.test.tsx
```
Expected: 전부 PASS.

- [ ] **Step 2: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 0 에러.

- [ ] **Step 3: 전체 스위트**

Run: `pnpm test`
Expected: 그린. (jsdom `localStorage` 계열 사전존재 실패가 보이면 본 변경과 무관 — `project_jsdom-localstorage-mass-fail` 참조. 단독 스위트 그린 + tsc/lint 0 이 게이트.)

- [ ] **Step 4: 회귀 점검(수동, 선택)** — 구매사 RFP 작성 위저드(`/rfp-create`)에서 PercentInput/CurrencyInput/DayOffsetInput 호출부가 `max`/`markerState` 미전달로 기존과 동일하게 동작하는지(상한 없음·칩 없음) 눈으로 확인.

---

## Self-Review

**1. Spec coverage**
- §4.1.1 보내기 침묵 제거 → Task 3 ✓
- §4.1.2 정산주기 마커/에러 → Task 4 ✓
- §4.1.3 수수료 단계 메시지 → Task 5 ✓
- §4.1.4 범위 밖 값 입력 차단(isAllowed) → Task 2(역량) + Task 5(적용) ✓
- §4.1.5 / §4.4 서버 거부 단계 매핑 → Task 6 ✓
- §4.2 SSOT(기존 validation 확장) → Task 1 ✓
- §4.3 파일 변경(inputs optional props, context attempt, sidebar/progress failedAt) → Task 2·3·4·5 ✓
- §6 테스트 전 항목 → Task별 + Task 7 ✓
- **스펙 대비 의도적 축소(YAGNI)**: 스펙 §4.3은 `PercentInput`/`FeeRateCell`에도 `markerState`/`error` 슬롯을 언급하나, UX(§4.1.3)상 수수료는 셀별 필수 칩을 쓰지 않고 단계-레벨 메시지만 쓰므로 두 입력에는 `max`만 추가하고 마커/에러 슬롯은 만들지 않는다(미사용 제거).

**2. Placeholder scan** — "TBD/TODO/적절히 처리" 등 없음. 모든 코드/명령/기대출력 명시 ✓

**3. Type consistency**
- `isCycleValid(cycleNum: string): boolean` — Task 1 정의, Task 4 소비, 시그니처 일치 ✓
- `max?: number` — Task 2 정의(Percent/FeeRateCell/Currency), Task 5 소비(`max={100}` / `max={100_000}`) ✓
- `markerState?: MarkerState`/`error?: string` (DayOffsetInput) — Task 2 정의, Task 4 소비 ✓
- `settlementAttempted`/`feesAttempted: boolean` — Task 4·5에서 context 정의·소비 일치 ✓
- `failedSteps`/`markFailed`/`failedAt` — Task 3 정의, Task 4·5·6 소비 ✓
- `SERVER_ERROR_STEP` — Task 6 내부 정의·사용 ✓
