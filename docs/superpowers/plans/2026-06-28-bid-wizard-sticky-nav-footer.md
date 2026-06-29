# BidWizard Sticky Nav Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix BidWizard step 2 scroll bug by splitting the right column into an independently-scrollable content area and a sticky navigation footer, so the "다음" button is always visible regardless of step content height.

**Architecture:** BidWizard.tsx gains `h-full flex flex-col` on its card wrapper so it fills DealRoomCenter's content area. The right column splits into a `flex-1 min-h-0 overflow-y-auto` content region and a `shrink-0` sticky footer that owns all back/next/submit buttons. Nav button props are removed from the four BidStep* components.

**Tech Stack:** React 19, Tailwind v4, TypeScript strict, Vitest + @testing-library/react

## Global Constraints

- TDD: every production change must be preceded by a failing test.
- No new dependencies.
- Button text labels must match existing values exactly: "수수료", "견적서", "검토·발송", "견적 보내기", "보내는 중…".
- `submitError` prop stays in `BidStepReview` (it renders an error banner in the content area).
- Run `pnpm test <path>` for fast single-file checks; `pnpm test` for full suite gate.
- Test command for this feature: `pnpm test components/inbox/bid-wizard`

---

## File Map

| File | Change |
|---|---|
| `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx` | Add 2 new tests (wizard-nav-footer exists; step 4 submit disabled) |
| `components/inbox/bid-wizard/BidWizard.tsx` | Layout split + add Button import + sticky footer |
| `components/inbox/bid-wizard/BidStepSettlement.tsx` | Remove `onNext` prop + button JSX |
| `components/inbox/bid-wizard/BidStepSettlementContainer.tsx` | Remove `advance → onNext` pass |
| `components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx` | Remove `onNext` from setup; remove nav button test |
| `components/inbox/bid-wizard/BidStepFees.tsx` | Remove `onBack`, `onNext` props + button JSX |
| `components/inbox/bid-wizard/BidStepFeesContainer.tsx` | Remove `back`, `advance` pass |
| `components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx` | Remove `onBack`, `onNext` from setup function |
| `components/inbox/bid-wizard/BidStepProposal.tsx` | Remove `onBack`, `onNext` props + button JSX |
| `components/inbox/bid-wizard/BidStepProposalContainer.tsx` | Remove `back`, `advance` pass |
| `components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx` | Remove `onBack`, `onNext` from setup function |
| `components/inbox/bid-wizard/BidStepReview.tsx` | Remove `canSubmit`, `pending`, `onBack`, `onSubmit` props + button JSX |
| `components/inbox/bid-wizard/BidStepReviewContainer.tsx` | Remove `canSubmit`, `pending`, `back`, `handleSubmit` pass |
| `components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx` | Remove nav props from setup + inline renders; delete 2 nav button tests |

---

## Task 1: Write failing tests (RED)

**Files:**
- Modify: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

**Interfaces:**
- Consumes: existing `BidWizard`, `rfp` fixture, `render`, `screen`, `within`, `userEvent` from the test file.
- Produces: two new failing assertions that pass once the sticky footer is implemented.

- [ ] **Step 1: Add `within` to the import and add the two failing tests**

In `BidWizard.test.tsx`, change line 2:
```tsx
import { render, screen, cleanup, waitFor } from '@testing-library/react';
```
to:
```tsx
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
```

Then append the following describe block **at the end of the file** (after the last `});`):

```tsx
describe('BidWizard 네비게이션 푸터', () => {
  it('wizard-nav-footer가 항상 렌더된다', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.getByTestId('wizard-nav-footer')).toBeInTheDocument();
  });

  it('4단계: 수수료 미입력 시 견적 보내기 비활성', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));
    const footer = screen.getByTestId('wizard-nav-footer');
    expect(within(footer).getByRole('button', { name: '견적 보내기' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to confirm RED**

```bash
pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
```

Expected: 2 new tests FAIL — "Unable to find an element by: [data-testid="wizard-nav-footer"]"

---

## Task 2: Implement all changes atomically (GREEN)

All production file edits + test cleanup in one commit. Run tests at the end.

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Modify: `components/inbox/bid-wizard/BidStepSettlement.tsx`
- Modify: `components/inbox/bid-wizard/BidStepSettlementContainer.tsx`
- Modify: `components/inbox/bid-wizard/BidStepFees.tsx`
- Modify: `components/inbox/bid-wizard/BidStepFeesContainer.tsx`
- Modify: `components/inbox/bid-wizard/BidStepProposal.tsx`
- Modify: `components/inbox/bid-wizard/BidStepProposalContainer.tsx`
- Modify: `components/inbox/bid-wizard/BidStepReview.tsx`
- Modify: `components/inbox/bid-wizard/BidStepReviewContainer.tsx`
- Modify: `components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx`
- Modify: `components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx`
- Modify: `components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx`
- Modify: `components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx`

**Interfaces:**
- Consumes: `BID_WIZARD_STEPS`, `TOTAL_STEPS`, `back`, `advance`, `handleSubmit`, `canSubmit`, `pending`, `currentStep` — all already in scope in `BidWizard.tsx`.
- Produces: `data-testid="wizard-nav-footer"` element in BidWizard render tree; updated BidStep* types with nav props removed.

### 2a. BidWizard.tsx

- [ ] **Step 3: Add Button import**

After line 8 (`import { Divider } from '@/components/ui/Divider';`), add:

```tsx
import { Button } from '@/components/primitives/Button';
```

- [ ] **Step 4: Change outer wrapper className (line 372)**

Old:
```tsx
      <div className="border border-[var(--md-sys-color-outline-variant)] rounded-[8px] overflow-hidden">
```
New:
```tsx
      <div className="border border-[var(--md-sys-color-outline-variant)] rounded-[8px] overflow-hidden h-full flex flex-col">
```

- [ ] **Step 5: Change inner flex row className (line 375)**

Old:
```tsx
          <div className="flex min-h-0">
```
New:
```tsx
          <div className="flex flex-1 min-h-0">
```

- [ ] **Step 6: Change right column className (line 404)**

Old:
```tsx
            <div className="flex-1 min-w-0 flex flex-col">
```
New:
```tsx
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
```

- [ ] **Step 7: Change step content div className (line 407)**

Old:
```tsx
              <div className="px-6 py-6">
```
New:
```tsx
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
```

- [ ] **Step 8: Add sticky footer after the content div**

After line 449 (`</div>` that closes the step content div), before line 450 (`</div>` that closes the right column), insert:

```tsx
            <div
              data-testid="wizard-nav-footer"
              className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-6 py-4 flex items-center justify-between"
            >
              <div>
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="text"
                    onClick={back}
                    icon={<span aria-hidden>←</span>}
                  >
                    {BID_WIZARD_STEPS[currentStep - 2].label}
                  </Button>
                )}
              </div>
              <div>
                {currentStep < TOTAL_STEPS ? (
                  <Button
                    type="button"
                    onClick={advance}
                    trailingIcon={<span aria-hidden>→</span>}
                  >
                    {BID_WIZARD_STEPS[currentStep].label}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                  >
                    {pending ? '보내는 중…' : '견적 보내기'}
                  </Button>
                )}
              </div>
            </div>
```

### 2b. BidStepSettlement.tsx

- [ ] **Step 9: Remove onNext prop and button JSX**

Old Props type:
```tsx
type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  onField: SetBidField;
  onNext: () => void;
};
```
New:
```tsx
type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  onField: SetBidField;
};
```

Remove `onNext` from destructure in the function signature:
```tsx
export function BidStepSettlement({
  cycleUnit,
  cycleNum,
  settleLimit,
  guaranteeInsurance,
  onField,
}: Props) {
```

Remove the nav button JSX block (lines 65–73):
```tsx
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onNext}
          trailingIcon={<span aria-hidden>→</span>}
        >
          수수료
        </Button>
      </div>
```

Also remove the unused `Button` import from the top (line 3):
```tsx
import { Button } from '@/components/primitives/Button';
```
(Only remove if Button is no longer used anywhere in the file after the deletion.)

### 2c. BidStepSettlementContainer.tsx

- [ ] **Step 10: Remove advance and onNext**

Old:
```tsx
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, setField, advance } =
    useBidWizardContext();
  return (
    <BidStepSettlement
      cycleUnit={cycleUnit}
      cycleNum={cycleNum}
      settleLimit={settleLimit}
      guaranteeInsurance={guaranteeInsurance}
      onField={setField}
      onNext={advance}
    />
  );
```
New:
```tsx
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, setField } =
    useBidWizardContext();
  return (
    <BidStepSettlement
      cycleUnit={cycleUnit}
      cycleNum={cycleNum}
      settleLimit={settleLimit}
      guaranteeInsurance={guaranteeInsurance}
      onField={setField}
    />
  );
```

### 2d. BidStepFees.tsx

- [ ] **Step 11: Remove onBack, onNext props and button JSX**

Old Props type:
```tsx
type Props = {
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  onFee: (key: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
};
```
New:
```tsx
type Props = {
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  onFee: (key: string, value: string) => void;
};
```

Remove `onBack`, `onNext` from destructure.

Remove nav button JSX block (lines 172–179):
```tsx
      <div className="flex justify-between">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          정산 조건
        </Button>
        <Button type="button" onClick={onNext} trailingIcon={<span aria-hidden>→</span>}>
          견적서
        </Button>
      </div>
```

Remove `Button` import (line 3) if no other Button usage remains.

### 2e. BidStepFeesContainer.tsx

- [ ] **Step 12: Remove back, advance and their prop pass**

Old:
```tsx
  const { feeInputMethods, customPaymentMethods, fees, setFee, back, advance } =
    useBidWizardContext();
  return (
    <BidStepFees
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      onFee={setFee}
      onBack={back}
      onNext={advance}
    />
  );
```
New:
```tsx
  const { feeInputMethods, customPaymentMethods, fees, setFee } =
    useBidWizardContext();
  return (
    <BidStepFees
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      onFee={setFee}
    />
  );
```

### 2f. BidStepProposal.tsx

- [ ] **Step 13: Remove onBack, onNext props and button JSX**

Old Props type:
```tsx
type Props = {
  proposal: ProposalState;
  memo: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  onMemoChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
};
```
New:
```tsx
type Props = {
  proposal: ProposalState;
  memo: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  onMemoChange: (value: string) => void;
};
```

Remove `onBack`, `onNext` from destructure.

Remove nav button JSX block (lines 118–125):
```tsx
      <div className="flex justify-between">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          수수료
        </Button>
        <Button type="button" onClick={onNext} trailingIcon={<span aria-hidden>→</span>}>
          검토·발송
        </Button>
      </div>
```

Remove `Button` import if no other Button usage remains.

### 2g. BidStepProposalContainer.tsx

- [ ] **Step 14: Remove back, advance**

Old:
```tsx
  const { proposal, memo: memoText, uploadProposal, clearProposal, setField, back, advance } =
    useBidWizardContext();
  return (
    <BidStepProposal
      proposal={proposal}
      memo={memoText}
      onUpload={uploadProposal}
      onClear={clearProposal}
      onMemoChange={(v) => setField('memo', v)}
      onBack={back}
      onNext={advance}
    />
  );
```
New:
```tsx
  const { proposal, memo: memoText, uploadProposal, clearProposal, setField } =
    useBidWizardContext();
  return (
    <BidStepProposal
      proposal={proposal}
      memo={memoText}
      onUpload={uploadProposal}
      onClear={clearProposal}
      onMemoChange={(v) => setField('memo', v)}
    />
  );
```

### 2h. BidStepReview.tsx

- [ ] **Step 15: Remove canSubmit, pending, onBack, onSubmit props and button JSX**

Old Props type:
```tsx
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
```
New (keep `submitError` — it renders an error banner in the content area):
```tsx
type Props = {
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  submitError: string | null;
  onSaveTemplate: (name: string) => Promise<{ ok: boolean; error?: string }>;
};
```

Remove `canSubmit`, `pending`, `onBack`, `onSubmit` from the function destructure.

Remove nav button JSX block (lines 176–183):
```tsx
      <div className="flex items-center justify-between gap-4">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          견적서
        </Button>
        <Button type="button" size="lg" onClick={onSubmit} disabled={!canSubmit}>
          {pending ? '보내는 중…' : '견적 보내기'}
        </Button>
      </div>
```

Remove `Button` import if no other Button usage remains.

### 2i. BidStepReviewContainer.tsx

- [ ] **Step 16: Remove canSubmit, pending, back, handleSubmit**

Old:
```tsx
  const {
    settleCycle,
    settleLimit,
    guaranteeInsurance,
    feeInputMethods,
    customPaymentMethods,
    fees,
    canSubmit,
    pending,
    submitError,
    back,
    handleSubmit,
    onSaveTemplate,
  } = useBidWizardContext();
  return (
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
  );
```
New:
```tsx
  const {
    settleCycle,
    settleLimit,
    guaranteeInsurance,
    feeInputMethods,
    customPaymentMethods,
    fees,
    submitError,
    onSaveTemplate,
  } = useBidWizardContext();
  return (
    <BidStepReview
      settleCycle={settleCycle}
      settleLimit={settleLimit}
      guaranteeInsurance={guaranteeInsurance}
      feeInputMethods={feeInputMethods}
      customPaymentMethods={customPaymentMethods}
      fees={fees}
      submitError={submitError}
      onSaveTemplate={onSaveTemplate}
    />
  );
```

### 2j. Update BidStepSettlement.test.tsx

- [ ] **Step 17: Remove onNext from setup and delete nav button test**

Replace `renderStep` function and delete the "다음 버튼 클릭 시 onNext 호출" test:

Old `renderStep`:
```tsx
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
```
New:
```tsx
function renderStep(over: Partial<React.ComponentProps<typeof BidStepSettlement>> = {}) {
  const onField = vi.fn();
  render(
    <BidStepSettlement
      cycleUnit="D"
      cycleNum="1"
      settleLimit="0"
      guaranteeInsurance="0"
      onField={onField}
      {...over}
    />,
  );
  return { onField };
}
```

Delete entire test block (lines 66–71):
```tsx
  it('다음 버튼 클릭 시 onNext 호출', async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep();
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(onNext).toHaveBeenCalled();
  });
```

### 2k. Update BidStepFees.test.tsx

- [ ] **Step 18: Remove onBack and onNext from setup**

Old setup:
```tsx
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
```
New:
```tsx
function setup(over: Partial<React.ComponentProps<typeof BidStepFees>> = {}) {
  const onFee = vi.fn();
  render(
    <BidStepFees
      feeInputMethods={['card', 'naver_pay', 'virtual_account']}
      customPaymentMethods={[]}
      fees={{}}
      onFee={onFee}
      {...over}
    />,
  );
  return { onFee };
}
```

Also remove the `const noop = () => {};` line (line 6) since it's no longer used.

### 2l. Update BidStepProposal.test.tsx

- [ ] **Step 19: Remove onBack and onNext from renderStep**

Old:
```tsx
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
```
New:
```tsx
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
      {...over}
    />,
  );
  return { onMemoChange, onUpload };
}
```

### 2m. Update BidStepReview.test.tsx

- [ ] **Step 20: Update renderStep — remove nav props; update two inline renders; delete two nav button tests**

Old `renderStep`:
```tsx
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
```
New:
```tsx
function renderStep(over: Partial<React.ComponentProps<typeof BidStepReview>> = {}) {
  const onSaveTemplate = vi.fn(async () => ({ ok: true as const }));
  render(
    <BidStepReview
      settleCycle="D+1"
      settleLimit="0"
      guaranteeInsurance="0"
      feeInputMethods={['card'] as PaymentMethod[]}
      customPaymentMethods={[]}
      fees={{ card: '1.5' }}
      submitError={null}
      onSaveTemplate={onSaveTemplate}
      {...over}
    />,
  );
  return { onSaveTemplate };
}
```

Delete these two test cases (lines 38–48):
```tsx
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
```

Update inline renders in two tests (lines 59–73 and 75–90) — remove `canSubmit`, `pending`, `onBack`, `onSubmit` props:

Test "정액(건당) 수단은 % 가 아니라 원으로 요약 표시한다" — change its inline `<BidStepReview .../>` to:
```tsx
      <BidStepReview
        settleCycle="D+1" settleLimit="0" guaranteeInsurance="0"
        feeInputMethods={['virtual_account'] as PaymentMethod[]}
        customPaymentMethods={[]}
        fees={{ virtual_account: '300' }}
        submitError={null}
        onSaveTemplate={async () => ({ ok: true })}
      />
```

Test "구간 수단은 구간별 요율을 요약 표시한다" — change its inline `<BidStepReview .../>` to:
```tsx
      <BidStepReview
        settleCycle="D+1" settleLimit="0" guaranteeInsurance="0"
        feeInputMethods={['card'] as PaymentMethod[]}
        customPaymentMethods={[]}
        fees={{ 'card:sole': '0.5', 'card:general': '1.8' }}
        submitError={null}
        onSaveTemplate={async () => ({ ok: true })}
      />
```

### 2n. Run tests to confirm GREEN

- [ ] **Step 21: Run bid-wizard tests**

```bash
pnpm test components/inbox/bid-wizard
```

Expected: ALL tests pass (including the 2 new tests from Task 1, all existing BidWizard integration tests, all updated step unit tests).

- [ ] **Step 22: Run tsc to confirm 0 errors**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 23: Commit**

```bash
git add \
  components/inbox/bid-wizard/BidWizard.tsx \
  components/inbox/bid-wizard/BidStepSettlement.tsx \
  components/inbox/bid-wizard/BidStepSettlementContainer.tsx \
  components/inbox/bid-wizard/BidStepFees.tsx \
  components/inbox/bid-wizard/BidStepFeesContainer.tsx \
  components/inbox/bid-wizard/BidStepProposal.tsx \
  components/inbox/bid-wizard/BidStepProposalContainer.tsx \
  components/inbox/bid-wizard/BidStepReview.tsx \
  components/inbox/bid-wizard/BidStepReviewContainer.tsx \
  components/inbox/bid-wizard/__tests__/BidWizard.test.tsx \
  components/inbox/bid-wizard/__tests__/BidStepSettlement.test.tsx \
  components/inbox/bid-wizard/__tests__/BidStepFees.test.tsx \
  components/inbox/bid-wizard/__tests__/BidStepProposal.test.tsx \
  components/inbox/bid-wizard/__tests__/BidStepReview.test.tsx
git commit -m "fix: BidWizard sticky nav footer — step content scrolls, buttons always visible"
```

---

## Task 3: Full suite gate

**Files:** none (verification only)

- [ ] **Step 24: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass (or pre-existing failures unrelated to this change — check MEMORY.md note on jsdom localStorage mass-fail being pre-existing).

- [ ] **Step 25: Verify in browser (manual)**

Open the PG inbox deal room with an RFP that has many payment methods (e.g., 카드 + 간편결제 3종 + 계좌이체 = 15+ fee cells). Confirm:
- Sticky footer is always visible at the bottom of the wizard card
- Step 2 content scrolls independently (fee table scrollable without affecting footer)
- Back/Next navigation works across all 4 steps
- Step 4: submit button disabled until cycleNum and at least one fee are entered
- Submit flow: clicking "견적 보내기" triggers the confirm dialog as before
