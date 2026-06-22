# RFP 필수값 인지 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구매사 RFP 작성 위저드에서 필수 필드 5개의 충족 여부를 작성 중 실시간으로 인지하게 하고, 필드 마커·스텝 녹색 체크·"다음" 막기가 같은 판정 함수를 공유하도록 한다.

**Architecture:** 필드별 순수 판정 함수를 `lib/rfp/required-fields.ts`(SSOT)에 두고, `wizard-validation.ts`(스텝 완료·토스트)·각 Step 컴포넌트의 마커가 이를 공유한다. 마커는 `RequiredMark` 프레젠테이션 컴포넌트(기존 `Chip` 재사용)로 3상태를 렌더한다. 홈페이지는 선택 → 필수로 승격하며 서버(`createRfpAction`)도 발송 시 검증한다.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Zustand(draft store), zod v4, Vitest(+jsdom), `@/components/primitives/Chip`.

## Global Constraints

- TDD 필수: RED → GREEN → REFACTOR. production code 전에 failing test 먼저. (`superpowers:test-driven-development`)
- 단일 파일 테스트: `pnpm test <path>` (RED/GREEN 확인). 전체 그린: `pnpm test`.
- Linear 디자인 하드룰 준수: pill 금지, 호버 그림자 금지, Status는 Chip 컴포넌트로(대괄호 평문 금지). Chip 색: 완료→tertiary, 오류→error, 중립→surface.
- DB 접근은 `lib/server/repositories/**`만 — 이 작업은 DB 접근 없음(순수 함수·UI·zod).
- 클라이언트 번들에서 tldts 제외: 클라이언트 판정은 `isValidWebsiteUrlLight`, 서버 검증만 `isValidWebsiteUrl`.
- 홈페이지 필수는 **발송 시(send=true)에만** 강제 — 드래프트 저장은 비어 있어도 허용(결제수단 패턴과 동일, `createRfpAction` superRefine).

## File Structure

- Create: `lib/rfp/required-fields.ts` — 순수 판정 함수 5개 + 마커 상태 매핑 (SSOT)
- Create: `lib/rfp/__tests__/required-fields.test.ts`
- Create: `components/rfp/RequiredMark.tsx` — 3상태 칩 (프레젠테이션)
- Modify: `components/rfp/wizard-validation.ts` — SSOT 소비, Step 2에 결제수단 추가, 홈페이지 빈값 hint 분기
- Modify: `components/rfp/__tests__/wizard-validation.test.ts` (없으면 Create)
- Modify: `components/rfp/RfpStep2Content.tsx` — 제목·홈페이지·결제수단 마커 + 홈페이지 빈값 에러
- Modify: `components/rfp/RfpPaymentMethodSelect.tsx` — 결제수단 마커 (props로 상태 수신)
- Modify: `components/rfp/RfpStep3PgSelect.tsx` — PG 마커
- Modify: `components/rfp/RfpStep4Review.tsx` — 마감일 마커
- Modify: `lib/server/actions/rfp/createRfpAction.ts` — 홈페이지 발송 시 필수 + 형식 검증
- Modify: `lib/server/actions/rfp/__tests__/createRfpAction.test.ts` (없으면 Create)

---

### Task 1: SSOT 판정 함수 + 마커 상태 매핑

**Files:**
- Create: `lib/rfp/required-fields.ts`
- Test: `lib/rfp/__tests__/required-fields.test.ts`

**Interfaces:**
- Consumes: `isValidWebsiteUrlLight` from `@/lib/validation/website-url`
- Produces:
  - `isTitleValid(title: string): boolean`
  - `isWebsiteValid(websiteUrl: string): boolean`
  - `isPaymentValid(required: readonly unknown[], custom: readonly unknown[]): boolean`
  - `isPgValid(ids: readonly unknown[]): boolean`
  - `isDeadlineValid(deadline: string): boolean`
  - `type MarkerState = 'empty' | 'filled' | 'error'`
  - `markerState(input: { valid: boolean; attempted: boolean }): MarkerState`

- [ ] **Step 1: Write the failing test**

`lib/rfp/__tests__/required-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isTitleValid,
  isWebsiteValid,
  isPaymentValid,
  isPgValid,
  isDeadlineValid,
  markerState,
} from '@/lib/rfp/required-fields';

describe('required-fields predicates', () => {
  it('isTitleValid: 공백/빈값 false, 내용 true', () => {
    expect(isTitleValid('')).toBe(false);
    expect(isTitleValid('   ')).toBe(false);
    expect(isTitleValid(' 견적 ')).toBe(true);
  });

  it('isWebsiteValid: 빈값 false(이제 필수), 형식오류 false, 유효 도메인 true', () => {
    expect(isWebsiteValid('')).toBe(false);
    expect(isWebsiteValid('   ')).toBe(false);
    expect(isWebsiteValid('not a url')).toBe(false);
    expect(isWebsiteValid('example.com')).toBe(true);
    expect(isWebsiteValid('https://example.com')).toBe(true);
  });

  it('isPaymentValid: 선택+직접입력 합이 1개 이상', () => {
    expect(isPaymentValid([], [])).toBe(false);
    expect(isPaymentValid(['card'], [])).toBe(true);
    expect(isPaymentValid([], [{ label: '기타' }])).toBe(true);
  });

  it('isPgValid: 1개 이상', () => {
    expect(isPgValid([])).toBe(false);
    expect(isPgValid([{ id: 'x' }])).toBe(true);
  });

  it('isDeadlineValid: 빈값/무효 false, 유효 날짜 true', () => {
    expect(isDeadlineValid('')).toBe(false);
    expect(isDeadlineValid('nope')).toBe(false);
    expect(isDeadlineValid('2099-01-01T23:59:59+09:00')).toBe(true);
  });
});

describe('markerState', () => {
  it('valid → filled', () => {
    expect(markerState({ valid: true, attempted: false })).toBe('filled');
    expect(markerState({ valid: true, attempted: true })).toBe('filled');
  });
  it('invalid + attempted → error', () => {
    expect(markerState({ valid: false, attempted: true })).toBe('error');
  });
  it('invalid + not attempted → empty', () => {
    expect(markerState({ valid: false, attempted: false })).toBe('empty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/rfp/__tests__/required-fields.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rfp/required-fields'`

- [ ] **Step 3: Write minimal implementation**

`lib/rfp/required-fields.ts`:

```ts
// lib/rfp/required-fields.ts
//
// RFP 작성 위저드 필수 필드 판정의 단일 출처(SSOT).
// 마커(필드 단위)·스텝 완료(wizard-validation)·"다음" 막기가 모두 이 함수를 공유한다.
// 클라이언트 번들에서 tldts를 제외하기 위해 경량 검사(isValidWebsiteUrlLight)를 쓴다.
import { isValidWebsiteUrlLight } from '@/lib/validation/website-url';

export function isTitleValid(title: string): boolean {
  return title.trim() !== '';
}

// 홈페이지는 필수: 비어있지 않으면서 형식도 통과해야 한다.
export function isWebsiteValid(websiteUrl: string): boolean {
  return websiteUrl.trim() !== '' && isValidWebsiteUrlLight(websiteUrl);
}

export function isPaymentValid(
  required: readonly unknown[],
  custom: readonly unknown[],
): boolean {
  return required.length + custom.length > 0;
}

export function isPgValid(ids: readonly unknown[]): boolean {
  return ids.length > 0;
}

export function isDeadlineValid(deadline: string): boolean {
  return deadline !== '' && !Number.isNaN(new Date(deadline).getTime());
}

export type MarkerState = 'empty' | 'filled' | 'error';

export function markerState(input: { valid: boolean; attempted: boolean }): MarkerState {
  if (input.valid) return 'filled';
  return input.attempted ? 'error' : 'empty';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/rfp/__tests__/required-fields.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add lib/rfp/required-fields.ts lib/rfp/__tests__/required-fields.test.ts
git commit -m "feat(rfp): 필수값 판정 SSOT 모듈 + 마커 상태 매핑"
```

---

### Task 2: wizard-validation을 SSOT로 리팩터 (결제수단 추가 + 홈페이지 필수)

**Files:**
- Modify: `components/rfp/wizard-validation.ts`
- Test: `components/rfp/__tests__/wizard-validation.test.ts` (없으면 Create)

**Interfaces:**
- Consumes: `isTitleValid`, `isWebsiteValid`, `isPaymentValid`, `isPgValid`, `isDeadlineValid` from `@/lib/rfp/required-fields`
- Produces: `WizardValidationDraft`에 `requiredPaymentMethods`, `customPaymentMethods` 추가. `getWizardValidity`/`getFirstIncompleteStep` 시그니처 유지(반환 타입 동일).

- [ ] **Step 1: Write the failing test**

`components/rfp/__tests__/wizard-validation.test.ts` (없으면 생성, 있으면 아래 케이스 추가):

```ts
import { describe, it, expect } from 'vitest';
import { getWizardValidity, type WizardValidationDraft } from '@/components/rfp/wizard-validation';

const base: WizardValidationDraft = {
  title: '견적 요청',
  websiteUrl: 'example.com',
  requiredPaymentMethods: ['card'],
  customPaymentMethods: [],
  allowedPgWorkspaceIds: [{ id: 'pg1' }],
  deadline: '2099-01-01T23:59:59+09:00',
};

function step(draft: WizardValidationDraft, num: number) {
  return getWizardValidity(draft).find((s) => s.num === num)!;
}

describe('wizard-validation Step 2 필수', () => {
  it('모두 채우면 complete', () => {
    expect(step(base, 2).complete).toBe(true);
  });

  it('홈페이지 빈값이면 미완료 + 입력 안내', () => {
    const d = { ...base, websiteUrl: '' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('홈페이지 주소를 입력해주세요');
  });

  it('홈페이지 형식 오류면 미완료 + 형식 안내', () => {
    const d = { ...base, websiteUrl: 'not a url' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('홈페이지 주소 형식을 확인해주세요');
  });

  it('결제수단 누락이면 Step 2 미완료 (회귀)', () => {
    const d = { ...base, requiredPaymentMethods: [], customPaymentMethods: [] };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('견적 받을 결제수단을 1개 이상 선택해주세요');
  });

  it('제목 빈값이면 미완료 + 제목 안내', () => {
    const d = { ...base, title: '  ' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('제목을 입력해주세요');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/rfp/__tests__/wizard-validation.test.ts`
Expected: FAIL — `requiredPaymentMethods` 미존재(타입) 및 결제수단/홈페이지 케이스 단언 실패

- [ ] **Step 3: Write minimal implementation**

`components/rfp/wizard-validation.ts` 전체를 아래로 교체:

```ts
// components/rfp/wizard-validation.ts
//
// 신규 견적 요청 wizard의 단일 검증 소스. 각 step은 자기 입력값만 보고
// 독립적으로 complete 여부를 판정한다(순서 무관). Sidebar·ProgressBar·발송
// 버튼이 모두 이 함수를 통해 동일한 기준으로 step 상태를 본다.
// 필드별 판정은 lib/rfp/required-fields(SSOT)를 공유한다.
import { WIZARD_STEPS } from './wizard-steps';
import {
  isTitleValid,
  isWebsiteValid,
  isPaymentValid,
  isPgValid,
  isDeadlineValid,
} from '@/lib/rfp/required-fields';

export type WizardValidationDraft = {
  title: string;
  websiteUrl: string;
  requiredPaymentMethods: readonly unknown[];
  customPaymentMethods: readonly unknown[];
  allowedPgWorkspaceIds: readonly unknown[];
  deadline: string;
};

export type StepValidity = { num: number; complete: boolean; hint: string };

function isStepComplete(num: number, draft: WizardValidationDraft): boolean {
  switch (num) {
    case 2:
      return (
        isTitleValid(draft.title) &&
        isWebsiteValid(draft.websiteUrl) &&
        isPaymentValid(draft.requiredPaymentMethods, draft.customPaymentMethods)
      );
    case 3:
      return isPgValid(draft.allowedPgWorkspaceIds);
    case 4:
      return isDeadlineValid(draft.deadline);
    default:
      // Step 1(사업자 확인)은 필수 입력이 없으므로 항상 complete.
      return true;
  }
}

// step별 미충족 사유 안내. Step 2는 제목 → 홈페이지 → 결제수단 순으로 분기.
function hintFor(num: number, draft: WizardValidationDraft): string {
  switch (num) {
    case 2:
      if (!isTitleValid(draft.title)) return '제목을 입력해주세요';
      if (draft.websiteUrl.trim() === '') return '홈페이지 주소를 입력해주세요';
      if (!isWebsiteValid(draft.websiteUrl)) return '홈페이지 주소 형식을 확인해주세요';
      return '견적 받을 결제수단을 1개 이상 선택해주세요';
    case 3:
      return 'PG를 1개 이상 선택해주세요';
    case 4:
      return '마감일을 선택해주세요';
    default:
      return '';
  }
}

export function getWizardValidity(draft: WizardValidationDraft): StepValidity[] {
  return WIZARD_STEPS.map(({ num }) => ({
    num,
    complete: isStepComplete(num, draft),
    hint: hintFor(num, draft),
  }));
}

export function getFirstIncompleteStep(draft: WizardValidationDraft): StepValidity | null {
  return getWizardValidity(draft).find((s) => !s.complete) ?? null;
}
```

- [ ] **Step 4: Update the call site (`RfpCreateWizard.tsx`)**

`getWizardValidity(draft)`에 전달되는 `draft`(Zustand store)는 이미 `requiredPaymentMethods`·`customPaymentMethods`를 포함하므로 추가 인자 매핑은 불필요하다. 타입만 맞으면 통과한다. `components/rfp/RfpCreateWizard.tsx`에서 `getWizardValidity`/`getFirstIncompleteStep` 호출이 컴파일되는지 확인(아래 typecheck로 검증).

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm test components/rfp/__tests__/wizard-validation.test.ts`
Expected: PASS (all)

Run: `pnpm tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add components/rfp/wizard-validation.ts components/rfp/__tests__/wizard-validation.test.ts
git commit -m "fix(rfp): Step 2 완료 판정에 결제수단·홈페이지 필수 반영 (SSOT 공유)"
```

---

### Task 3: RequiredMark 컴포넌트

**Files:**
- Create: `components/rfp/RequiredMark.tsx`
- Test: `components/rfp/__tests__/RequiredMark.test.tsx`

**Interfaces:**
- Consumes: `MarkerState` from `@/lib/rfp/required-fields`, `Chip` from `@/components/primitives/Chip`
- Produces: `RequiredMark({ state }: { state: MarkerState })` — `empty`→surface 칩 `필수`, `filled`→tertiary 칩 `입력 완료`+Check, `error`→error 칩 `필수`

- [ ] **Step 1: Write the failing test**

`components/rfp/__tests__/RequiredMark.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequiredMark } from '@/components/rfp/RequiredMark';

describe('RequiredMark', () => {
  it('empty: "필수" 라벨', () => {
    render(<RequiredMark state="empty" />);
    expect(screen.getByText('필수')).toBeInTheDocument();
  });

  it('filled: "입력 완료" 라벨', () => {
    render(<RequiredMark state="filled" />);
    expect(screen.getByText('입력 완료')).toBeInTheDocument();
  });

  it('error: "필수" 라벨 유지', () => {
    render(<RequiredMark state="error" />);
    expect(screen.getByText('필수')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/rfp/__tests__/RequiredMark.test.tsx`
Expected: FAIL — `Cannot find module '@/components/rfp/RequiredMark'`

- [ ] **Step 3: Write minimal implementation**

`components/rfp/RequiredMark.tsx`:

```tsx
'use client';

import { Check } from 'lucide-react';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import type { MarkerState } from '@/lib/rfp/required-fields';

const CONFIG: Record<MarkerState, { color: ChipColor; label: string; icon?: React.ReactNode }> = {
  empty: { color: 'surface', label: '필수' },
  filled: { color: 'tertiary', label: '입력 완료', icon: <Check /> },
  error: { color: 'error', label: '필수' },
};

export function RequiredMark({ state }: { state: MarkerState }) {
  const { color, label, icon } = CONFIG[state];
  return <Chip variant="assist" color={color} label={label} icon={icon} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/rfp/__tests__/RequiredMark.test.tsx`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add components/rfp/RequiredMark.tsx components/rfp/__tests__/RequiredMark.test.tsx
git commit -m "feat(rfp): 필수 필드 상태 칩 RequiredMark"
```

---

### Task 4: Step 2 마커 배선 (제목·홈페이지·결제수단) + 홈페이지 빈값 에러

**Files:**
- Modify: `components/rfp/RfpStep2Content.tsx`
- Modify: `components/rfp/RfpPaymentMethodSelect.tsx`

**Interfaces:**
- Consumes: `isTitleValid`, `isWebsiteValid`, `isPaymentValid`, `markerState` from `@/lib/rfp/required-fields`; `RequiredMark` from `./RequiredMark`
- Produces: `RfpPaymentMethodSelect`에 `markerState?: MarkerState` prop 추가

이 Task는 시각 배선이 주이지만, 마커 상태가 판정 함수와 연결되는지 단언하기 위해 한 가지 동작 테스트를 둔다.

- [ ] **Step 1: Write the failing test**

`components/rfp/__tests__/RfpStep2Content.test.tsx` (없으면 생성, 있으면 케이스 추가). draft store는 실제 Zustand store를 쓰되 테스트 시작 시 초기화한다.

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep2Content } from '@/components/rfp/RfpStep2Content';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.getState().reset();
});

describe('RfpStep2Content 제목 마커', () => {
  it('제목 비어있으면 "필수", 입력하면 "입력 완료"로 전환', async () => {
    render(<RfpStep2Content onBack={() => {}} onNext={() => {}} />);
    // 제목 마커 초기 상태
    expect(screen.getAllByText('필수').length).toBeGreaterThan(0);

    const titleInput = screen.getByPlaceholderText('2026 서포트쇼핑몰 결제 인프라 견적 요청');
    await userEvent.type(titleInput, '견적 요청');

    expect(screen.getAllByText('입력 완료').length).toBeGreaterThan(0);
  });
});
```

> 참고: draft store에 `reset()`이 없으면 이 Step에서 추가하지 말고, 테스트에서 `useRfpDraftStore.setState(초기값)`으로 직접 초기화한다. (store API는 `lib/stores/rfp-draft.ts` 확인.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/rfp/__tests__/RfpStep2Content.test.tsx`
Expected: FAIL — "입력 완료" 텍스트 없음(마커 미배선)

- [ ] **Step 3: 제목·홈페이지 마커 + 홈페이지 빈값 에러 배선**

`components/rfp/RfpStep2Content.tsx`:

import에 추가:

```tsx
import { RequiredMark } from './RequiredMark';
import { isTitleValid, isWebsiteValid, markerState } from '@/lib/rfp/required-fields';
```

`RfpStep2Content` 함수 본문 상단(`const websiteInvalid = ...` 부근)을 교체:

```tsx
  const attempted = !!showFieldErrors;
  // 홈페이지: 빈값(필수 미입력)과 형식 오류를 구분
  const websiteEmpty = draft.websiteUrl.trim() === '';
  const websiteFormatInvalid = !websiteEmpty && !isValidWebsiteUrlLight(draft.websiteUrl);
  const websiteError = (attempted || websiteFormatInvalid);
  const titleError = (attempted || false) && draft.title.trim() === '';
```

제목 라벨 줄(`<Label size="md" muted={false}>제목 *</Label>`)을 교체:

```tsx
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>제목</Label>
          <RequiredMark state={markerState({ valid: isTitleValid(draft.title), attempted })} />
        </div>
```

홈페이지 라벨 줄(`<Label size="md" muted={false}>사업 운영 홈페이지</Label>`)을 교체:

```tsx
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>사업 운영 홈페이지</Label>
          <RequiredMark state={markerState({ valid: isWebsiteValid(draft.websiteUrl), attempted })} />
        </div>
```

홈페이지 에러 메시지 블록(`{websiteInvalid && (...)}`)을 교체 — 빈값과 형식 오류 메시지를 분기:

```tsx
        {websiteEmpty && attempted && (
          <p role="alert" className="text-[12px] text-[var(--md-sys-color-error)]">
            홈페이지 주소를 입력해주세요
          </p>
        )}
        {websiteFormatInvalid && (
          <p role="alert" className="text-[12px] text-[var(--md-sys-color-error)]">
            {WEBSITE_URL_ERROR}
          </p>
        )}
```

> 주의: 기존 `const websiteInvalid = !isValidWebsiteUrlLight(draft.websiteUrl);`와 `aria-invalid={websiteInvalid}`는 위 변수로 정리한다. input의 `aria-invalid`는 `aria-invalid={websiteFormatInvalid || (websiteEmpty && attempted)}`로 교체.

- [ ] **Step 4: 결제수단 마커 배선**

`components/rfp/RfpPaymentMethodSelect.tsx` — props에 마커 상태를 받아 라벨 옆에 렌더.

import 추가:

```tsx
import { RequiredMark } from './RequiredMark';
import type { MarkerState } from '@/lib/rfp/required-fields';
```

컴포넌트 props 타입에 `markerState?: MarkerState` 추가하고, 라벨 줄(`견적 받을 결제수단 *`)을 교체:

```tsx
      <div className="flex items-center gap-2">
        <Label size="md" muted={false}>견적 받을 결제수단</Label>
        {markerState && <RequiredMark state={markerState} />}
      </div>
```

`RfpStep2Content.tsx`에서 `<RfpPaymentMethodSelect />` 호출에 prop 전달:

```tsx
      <RfpPaymentMethodSelect
        markerState={markerState({
          valid: isPaymentValid(draft.requiredPaymentMethods, draft.customPaymentMethods),
          attempted,
        })}
      />
```

(`isPaymentValid`를 import에 추가한다.)

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm test components/rfp/__tests__/RfpStep2Content.test.tsx`
Expected: PASS

Run: `pnpm tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add components/rfp/RfpStep2Content.tsx components/rfp/RfpPaymentMethodSelect.tsx components/rfp/__tests__/RfpStep2Content.test.tsx
git commit -m "feat(rfp): Step 2 제목·홈페이지·결제수단 필수 마커 + 홈페이지 빈값 에러"
```

---

### Task 5: Step 3(PG)·Step 4(마감일) 마커 배선

**Files:**
- Modify: `components/rfp/RfpStep3PgSelect.tsx`
- Modify: `components/rfp/RfpStep4Review.tsx`

**Interfaces:**
- Consumes: `isPgValid`, `isDeadlineValid`, `markerState` from `@/lib/rfp/required-fields`; `RequiredMark` from `./RequiredMark`

- [ ] **Step 1: Write the failing test**

`components/rfp/__tests__/RfpStep4Review.test.tsx` (없으면 생성, 있으면 케이스 추가):

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RfpStep4Review } from '@/components/rfp/RfpStep4Review';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.setState({ deadline: '' });
});

describe('RfpStep4Review 마감일 마커', () => {
  it('마감일 비어있으면 "필수"', () => {
    render(<RfpStep4Review onBack={() => {}} /* 기존 필수 props 채우기 */ {...({} as any)} />);
    expect(screen.getAllByText('필수').length).toBeGreaterThan(0);
  });
});
```

> 주의: `RfpStep4Review`의 실제 props 시그니처를 파일에서 확인해 필수 props를 모두 전달한다(샘플 배너·발송 핸들러 등). 단언 핵심은 마감일 마커 "필수" 노출이다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/rfp/__tests__/RfpStep4Review.test.tsx`
Expected: FAIL — "필수" 텍스트 없음

- [ ] **Step 3: Step 4 마감일 마커 배선**

`components/rfp/RfpStep4Review.tsx`:

import 추가:

```tsx
import { RequiredMark } from './RequiredMark';
import { isDeadlineValid, markerState } from '@/lib/rfp/required-fields';
```

마감일 라벨 줄(`마감일 *`)을 교체:

```tsx
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>마감일</Label>
          <RequiredMark
            state={markerState({
              valid: isDeadlineValid(draft.deadline),
              attempted: !!showFieldErrors,
            })}
          />
        </div>
```

> `draft`·`showFieldErrors`가 컴포넌트 스코프에 있는지 확인(이미 `deadlineError`에서 `showFieldErrors`를 사용 중).

- [ ] **Step 4: Step 3 PG 마커 배선**

`components/rfp/RfpStep3PgSelect.tsx` — 초대 PG 라벨(헤더)에 마커 추가.

import 추가:

```tsx
import { RequiredMark } from './RequiredMark';
import { isPgValid, markerState } from '@/lib/rfp/required-fields';
```

PG 섹션 헤더 라벨 옆에 추가(파일에서 "초대할 PG" 라벨 위치 확인):

```tsx
        <div className="flex items-center gap-2">
          <Label size="md" muted={false}>초대할 PG사</Label>
          <RequiredMark
            state={markerState({
              valid: isPgValid(draft.allowedPgWorkspaceIds),
              attempted: !!showFieldErrors,
            })}
          />
        </div>
```

> `draft`·`showFieldErrors`가 스코프에 있는지 확인. `allowedPgWorkspaceIds`는 store 필드.

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm test components/rfp/__tests__/RfpStep4Review.test.tsx`
Expected: PASS

Run: `pnpm tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add components/rfp/RfpStep3PgSelect.tsx components/rfp/RfpStep4Review.tsx components/rfp/__tests__/RfpStep4Review.test.tsx
git commit -m "feat(rfp): Step 3 PG·Step 4 마감일 필수 마커"
```

---

### Task 6: 서버 — 홈페이지 발송 시 필수 + 형식 검증

**Files:**
- Modify: `lib/server/actions/rfp/createRfpAction.ts`
- Test: `lib/server/actions/rfp/__tests__/createRfpAction.test.ts` (없으면 Create — zod Input 스키마 검증만)

**Interfaces:**
- Consumes: `isValidWebsiteUrl` from `@/lib/validation/website-url`
- Produces: 발송(`send: true`) 시 `websiteUrl`이 비어 있거나 형식 오류면 reject. 드래프트(`send: false`)는 비어 있어도 허용.

- [ ] **Step 1: Write the failing test**

기존 `createRfpAction` 테스트 파일에 zod 스키마 단언을 추가한다. 액션 전체 실행이 어려우면, 검증 분기를 순수 함수로 노출해 테스트한다 — 단, **가능하면 기존 테스트 패턴(액션 호출 + mock)을 따른다.** 아래는 superRefine 동작을 검증하는 케이스:

```ts
// 발송 시 홈페이지 누락 → 에러
it('send=true이고 websiteUrl 비면 결과가 ok:false', async () => {
  const res = await createRfpAction(/* 유효 입력에서 websiteUrl='' , send:true */);
  expect(res.ok).toBe(false);
});

// 드래프트 저장 시 홈페이지 누락 → 허용
it('send=false이면 websiteUrl 비어도 통과', async () => {
  const res = await createRfpAction(/* websiteUrl='', send:false */);
  expect(res.ok).toBe(true);
});
```

> 실제 입력 형태·mock은 기존 테스트 파일을 그대로 따른다. 테스트 작성 전 `createRfpAction`의 인자 형태와 기존 mock(세션·repo)을 파일에서 확인한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/actions/rfp/__tests__/createRfpAction.test.ts`
Expected: FAIL — 현재는 send=true + 빈 websiteUrl도 통과

- [ ] **Step 3: superRefine에 홈페이지 발송 검증 추가**

`lib/server/actions/rfp/createRfpAction.ts`의 superRefine을 확장(기존 결제수단 블록 아래에 추가):

```ts
  .superRefine((d, ctx) => {
    if (d.send && d.requiredPaymentMethods.length + d.customPaymentMethods.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiredPaymentMethods'],
        message: '발송하려면 결제수단을 1개 이상 선택해야 합니다.',
      });
    }
    // 홈페이지: 발송 시 필수 + 형식 검증 (드래프트 저장은 비어도 허용)
    if (d.send) {
      const v = (d.websiteUrl ?? '').trim();
      if (v === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['websiteUrl'],
          message: '발송하려면 홈페이지 주소를 입력해야 합니다.',
        });
      } else if (!isValidWebsiteUrl(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['websiteUrl'],
          message: WEBSITE_URL_ERROR,
        });
      }
    }
  });
```

> 기존 `websiteUrl` 필드 정의(`.optional().refine(...)`)는 그대로 둔다(드래프트의 형식 검증 유지). 발송 시 필수는 superRefine이 담당한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/server/actions/rfp/__tests__/createRfpAction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/actions/rfp/createRfpAction.ts lib/server/actions/rfp/__tests__/createRfpAction.test.ts
git commit -m "feat(rfp): 발송 시 홈페이지 필수 + 형식 검증 (서버)"
```

---

### Task 7: 픽스처/시드 보정 + 전체 그린

**Files:**
- Modify: 홈페이지 없이 RFP를 발송 생성하는 테스트 픽스처·시드·e2e 헬퍼 (grep으로 탐색)

- [ ] **Step 1: 발송 경로에서 websiteUrl 누락 지점 탐색**

Run:
```bash
grep -rn "createRfpAction\|send: true\|send:true" lib scripts e2e __tests__ components 2>/dev/null | grep -iv "websiteUrl" | head -40
grep -rln "isSample\|isDemo\|seed" scripts lib 2>/dev/null | head
```

발송(`send:true`)으로 RFP를 만드는 픽스처/시드에서 `websiteUrl`이 빠진 곳을 찾아 유효 값(예: `example.com`)을 추가한다. (샘플/데모 RFP 시드 포함.)

- [ ] **Step 2: 전체 스위트 실행**

Run: `pnpm test`
Expected: 전부 PASS. 홈페이지 필수화로 빨개진 발송 픽스처를 모두 보정.

> 참고: 전체 스위트는 메모리/스왑 부하 시 느려질 수 있다(메모리 참고). 빨간 테스트는 단독 파일로 재확인(`pnpm test <path>`)한 뒤 고친다.

- [ ] **Step 3: lint + typecheck**

Run: `pnpm lint && pnpm tsc --noEmit`
Expected: 0 error

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(rfp): 홈페이지 필수화에 따른 발송 픽스처 보정 + 전체 그린"
```

---

## Self-Review

**Spec coverage:**
- 필수 5개 + 유효 기준 → Task 1 (판정), Task 4/5 (마커), Task 6 (서버 홈페이지)
- 홈페이지 선택 → 필수 (메시지 분기) → Task 2(클라 hint), Task 4(빈값 에러), Task 6(서버)
- 마커 3상태 → Task 1(매핑), Task 3(컴포넌트), Task 4/5(배선)
- 스텝 완료 = AND, 결제수단 누락 결함 수정 → Task 2
- SSOT 공유 → Task 1 정의, Task 2/4/5 소비
- 서버 검증 → Task 6
- 테스트 5종 → Task 1·2·3·4·5·6 각 RED 먼저
- 영향(픽스처) → Task 7

**Placeholder scan:** 코드 스텝은 모두 실제 코드 포함. Task 5·6의 테스트는 "기존 props/입력 형태 확인" 지시가 있으나, 이는 파일 구조 의존(실 시그니처)이라 의도적 — 핵심 단언은 명시됨.

**Type consistency:** `MarkerState`·`markerState`·판정 함수명이 Task 1 정의와 Task 2/3/4/5 사용에서 일치. `WizardValidationDraft`에 추가된 `requiredPaymentMethods`/`customPaymentMethods`는 store 필드명과 일치(확인됨).

**deadline 주의:** `isDeadlineValid`는 "유효 날짜"만 검사(현재 next-gating과 동일). "내일(KST) 이후"는 Step 4 날짜 피커의 `min` 속성이 입력 시점에 강제하므로 세 신호 일관성은 유지된다. (스펙의 "내일 이후"는 피커 레벨에서 충족.)
