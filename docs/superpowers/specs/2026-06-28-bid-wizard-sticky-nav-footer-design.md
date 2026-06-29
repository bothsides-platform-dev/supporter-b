# BidWizard Sticky Nav Footer — Design Spec

**Date:** 2026-06-28

## Context

BidWizard step 2 (수수료) contains a tiered fee matrix that can span many rows (e.g., 15 cells for 3 payment methods × 5 tiers). The wizard card is rendered inside `DealRoomCenter`'s content area. The "다음" button lives at the bottom of the step content, but because the wizard's container is height-constrained by the parent flex layout without internal scroll, the button is unreachable — it scrolls off the bottom of the clipped area and the user cannot proceed.

The fix: split the wizard's right column into (1) a scrollable content area and (2) a sticky footer that always shows the navigation buttons.

## Root Cause

```
DealRoomCenter content div  (flex-1 min-h-0 overflow-y-auto)
  └─ BidWizard wrapper      (overflow-hidden, no explicit height)
      └─ div.flex.min-h-0   (inner row — min-h-0 allows shrink)
          └─ right column   (flex-1 min-w-0 flex flex-col)
              └─ div.px-6.py-6   ← NO overflow, nav buttons inside here
```

`min-h-0` on the inner flex row allows the wizard to shrink below its natural content height, and `overflow-hidden` on the wrapper clips anything that overflows. The "다음" button — at the bottom of the step content — ends up outside the visible clip rectangle.

## Design

### Layout Change (BidWizard.tsx)

Add `h-full flex flex-col` to the outer wrapper so it fills the DealRoomCenter content area. Then split the right column into a scrollable content region and a sticky footer:

```
BidWizard wrapper        border rounded-[8px] overflow-hidden h-full flex flex-col
  └─ div.flex.flex-1.min-h-0      (inner row, grows to fill)
      ├─ WizardStepSidebar        (unchanged)
      └─ right column             (flex-1 min-w-0 flex flex-col min-h-0)
          ├─ WizardProgressBar    (shrink-0, unchanged)
          ├─ content area         (flex-1 min-h-0 overflow-y-auto px-6 py-6)
          │   └─ step component   (no nav buttons)
          └─ sticky footer        (shrink-0 border-t px-6 py-4)
              ├─ back button      (hidden on step 1)
              └─ next / submit button
```

### Sticky Footer Logic (in BidWizard.tsx)

```
Step labels: ['정산 조건', '수수료', '견적서', '검토·발송']

Back button (steps 2–4):
  label  = STEP_LABELS[currentStep - 2]
  onClick = back()

Next button (steps 1–3):
  label  = STEP_LABELS[currentStep]   // name of the next step
  onClick = advance()

Submit button (step 4):
  label  = pending ? '보내는 중…' : '견적 보내기'
  onClick = handleSubmit()
  disabled = !canSubmit
```

Layout: `flex items-center justify-between` — back button on left, next/submit on right. When back is absent (step 1), a placeholder `<div>` keeps the next button right-aligned.

### Step Component Changes

Remove nav button JSX and corresponding props from each step:

| Component | Props removed | JSX removed |
|---|---|---|
| BidStepSettlement | `onNext` | `<div className="flex justify-end">…</div>` |
| BidStepFees | `onBack`, `onNext` | `<div className="flex justify-between">…</div>` |
| BidStepProposal | `onBack`, `onNext` | `<div className="flex justify-between">…</div>` |
| BidStepReview | `onBack`, `onSubmit`, `canSubmit`, `pending` | `<div className="flex items-center justify-between gap-4">…</div>` |

`submitError` stays in BidStepReview if it renders an error banner inside the content area; otherwise remove it too.

### Container Changes

Remove the back/advance/handleSubmit/canSubmit/pending pass-through from:
- `BidStepSettlementContainer`
- `BidStepFeesContainer`
- `BidStepProposalContainer`
- `BidStepReviewContainer`

## Tests (TDD — RED first)

In `BidWizard.test.tsx`:

1. **Sticky footer exists outside step content**: render the wizard, assert the nav button container is NOT a descendant of the step content scroll area.
2. **Step 1 has no back button**: render step 1, assert back button is absent.
3. **Step 2–3 show back and next**: click advance, assert both buttons present with correct labels.
4. **Step 4 submit disabled when canSubmit=false**: render to step 4 with incomplete state, assert submit button is disabled.
5. **Step 4 submit shows '보내는 중…' when pending**: set pending=true, assert button text.

TypeScript compilation enforces that `BidStepFees` no longer accepts `onBack`/`onNext` — no explicit test needed.

## Verification

1. `pnpm test components/inbox/bid-wizard` — all existing + new tests green
2. `pnpm tsc --noEmit` — 0 errors
3. Open the PG inbox deal room with an RFP that has many payment methods (e.g., 카드 + 간편결제 3종 + 계좌이체 + 휴대폰결제 = 15+ cells). Confirm:
   - "다음" button is always visible in the sticky footer
   - Step content scrolls independently
   - Back navigation works correctly across all 4 steps
   - Submitting from step 4 still triggers the confirm dialog
