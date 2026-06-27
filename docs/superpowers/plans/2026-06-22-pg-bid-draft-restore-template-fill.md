# PG 견적 작성 초안 자동 복원 + 템플릿 채우기 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG 견적 작성 위저드에서 저장된 초안을 묻지 않고 자동 복원(토스트로 안내)하고, 사이드바 `초기화`로 처음부터 다시 시작하게 하며, 템플릿 불러오기를 저장 0개여도 항상 노출(+빈 상태 안내)한다.

**Architecture:** 변경은 클라이언트 한정 — `BidWizard.tsx`(상태/이펙트/JSX)와 순수 헬퍼 `useBidDraft.ts`. 묻는 배너를 제거하고, 마운트 시 "의미 있는 초안"이면 폼을 초기값으로 채우고 토스트 1회를 띄운다. "의미 있는 초안" 판정은 baseline(=위저드가 처음 열렸을 때 폼)과의 동치 비교(`isPristineDraft`)로 한다. 저장 로직(`saveDraft`)은 그대로 두고 **복원 시점에만** pristine 초안을 무시한다(과거에 빈 폼이 자동저장돼 다음에 배너가 뜨던 선결함이 이 게이트로 함께 해소됨 — 스펙 §3의 저장 게이트를 더 단순한 복원 게이트로 실현). 서버 액션·DB·스키마·이메일 변경 없음.

**Tech Stack:** Next.js App Router(React 19) · TypeScript strict · Vitest + Testing Library(jsdom) · 토스트 `@/lib/toast` · 다이얼로그 `@/components/ui/confirm-dialog` · `next/link`.

## Global Constraints

- TDD 필수: RED → GREEN → REFACTOR. failing test를 먼저 작성하고 `pnpm test <path>`로 빨갛게 떨어지는 것을 확인한 뒤 구현한다.
- 단일 파일 테스트 실행: `pnpm test <path-to-test>` (RED/GREEN 빠른 확인). 전체 그린은 `pnpm test`.
- 토스트 호출은 `toast(message, opts?)` — `opts` = `{ id?: string; type?: 'info'|'error'|'success'; timeout?: number }`. 본 작업 토스트는 기본 타입(info).
- `ConfirmDialog` props: `variant`는 `'danger' | 'default'`만 존재(‘destructive’ 아님 — `danger` 사용). `cancelLabel` 기본값 `'취소'`.
- UX 문구(해요체, `UX_WRITING.md`)는 본 플랜에 명시된 정확한 문자열을 그대로 사용한다.
- 서버/DB/액션/이메일: 변경 금지(본 작업 범위 외).
- 작업 디렉터리: 워크트리 `/Users/yeonseong/project/bidit/.claude/worktrees/feat+bid-draft-autofill-template`. 모든 경로는 이 워크트리 기준.
- 워크트리 LSP/에디터 진단은 신뢰하지 말 것 — `pnpm test`와 `pnpm tsc --noEmit`가 진실.
- 커밋 메시지 끝에 다음 줄 포함:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: `useBidDraft`에 `EMPTY_BID_DRAFT` 상수 + `isPristineDraft` 헬퍼 추가

**Files:**
- Modify: `components/inbox/useBidDraft.ts`
- Test: `components/inbox/__tests__/useBidDraft.test.ts`

**Interfaces:**
- Consumes: 기존 `BidDraft` 타입(`useBidDraft.ts`).
- Produces:
  - `export const EMPTY_BID_DRAFT: BidDraft` — `{ __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: {}, memo: '' }`
  - `export function isPristineDraft(d: BidDraft, baseline: BidDraft): boolean` — 두 초안이 "의미상 동일"한지. `fees`의 빈 문자열 값은 무시, 키 순서 무관. `settleLimit`/`guaranteeInsurance`는 `''`와 `'0'`을 동일하게 취급.

- [ ] **Step 1: 실패하는 테스트 작성**

`components/inbox/__tests__/useBidDraft.test.ts`의 import 줄을 수정하고(맨 위), 파일 맨 끝(마지막 `});` 다음)에 describe 블록을 추가한다.

import 줄 교체:
```ts
import { useBidDraft, EMPTY_BID_DRAFT, isPristineDraft } from '../useBidDraft';
```

파일 끝에 추가:
```ts
describe('isPristineDraft / EMPTY_BID_DRAFT', () => {
  it('EMPTY_BID_DRAFT는 자기 자신에 대해 pristine', () => {
    expect(isPristineDraft(EMPTY_BID_DRAFT, EMPTY_BID_DRAFT)).toBe(true);
  });

  it('fee가 채워지면 pristine 아님', () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, fees: { card: '1.0' } }, EMPTY_BID_DRAFT)).toBe(false);
  });

  it('빈 문자열 fee 값은 무시한다(pristine 유지)', () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, fees: { card: '' } }, EMPTY_BID_DRAFT)).toBe(true);
  });

  it("settleLimit '0'과 ''는 동일하게 취급한다", () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, settleLimit: '' }, EMPTY_BID_DRAFT)).toBe(true);
  });

  it('memo가 바뀌면 pristine 아님', () => {
    expect(isPristineDraft({ ...EMPTY_BID_DRAFT, memo: 'x' }, EMPTY_BID_DRAFT)).toBe(false);
  });

  it('fees 키 순서가 달라도 내용이 같으면 pristine', () => {
    const base = { ...EMPTY_BID_DRAFT, fees: { a: '1', b: '2' } };
    const other = { ...EMPTY_BID_DRAFT, fees: { b: '2', a: '1' } };
    expect(isPristineDraft(other, base)).toBe(true);
  });

  it('baseline(재요청 prefill)과 동일하면 pristine, 편집되면 아님', () => {
    const baseline = { ...EMPTY_BID_DRAFT, cycleUnit: 'M' as const, cycleNum: '2', fees: { card: '0.5' } };
    expect(isPristineDraft({ ...baseline }, baseline)).toBe(true);
    expect(isPristineDraft({ ...baseline, fees: { card: '0.9' } }, baseline)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test components/inbox/__tests__/useBidDraft.test.ts`
Expected: FAIL — `EMPTY_BID_DRAFT`/`isPristineDraft`가 export되지 않아 import 에러.

- [ ] **Step 3: 최소 구현**

`components/inbox/useBidDraft.ts`의 `BidDraft` 타입 정의 바로 아래(`function draftKey` 위)에 추가:
```ts
export const EMPTY_BID_DRAFT: BidDraft = {
  __v: 3,
  cycleUnit: 'D',
  cycleNum: '1',
  settleLimit: '0',
  guaranteeInsurance: '0',
  fees: {},
  memo: '',
};

// '' 와 '0' 을 동일한 "빈 값"으로 본다 (CurrencyInput 마운트 churn 방어).
const normNum = (s: string) => (s === '' ? '0' : s);

// 빈 문자열 fee 값은 입력이 아닌 것으로 본다.
function normalizeFees(fees: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fees)) if (v !== '') out[k] = v;
  return out;
}

function feesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const na = normalizeFees(a);
  const nb = normalizeFees(b);
  const ka = Object.keys(na).sort();
  const kb = Object.keys(nb).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && na[k] === nb[k]);
}

/**
 * 초안이 baseline(위저드가 처음 열렸을 때 폼)과 의미상 동일한지.
 * true 이면 "복원할 만한 내용 없음" → 자동 복원/토스트/초기화 노출을 건너뛴다.
 */
export function isPristineDraft(d: BidDraft, baseline: BidDraft): boolean {
  return (
    d.cycleUnit === baseline.cycleUnit &&
    d.cycleNum === baseline.cycleNum &&
    normNum(d.settleLimit) === normNum(baseline.settleLimit) &&
    normNum(d.guaranteeInsurance) === normNum(baseline.guaranteeInsurance) &&
    d.memo === baseline.memo &&
    feesEqual(d.fees, baseline.fees)
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test components/inbox/__tests__/useBidDraft.test.ts`
Expected: PASS (기존 테스트 포함 전부 green).

- [ ] **Step 5: 커밋**

```bash
git add components/inbox/useBidDraft.ts components/inbox/__tests__/useBidDraft.test.ts
git commit -m "$(cat <<'EOF'
feat(bid-draft): EMPTY_BID_DRAFT 상수 + isPristineDraft 헬퍼 추가

초안 자동 복원의 "의미 있는 초안" 판정용 순수 헬퍼.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 초안 자동 복원(배너 제거 + 토스트) + 사이드바 초기화

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

**Interfaces:**
- Consumes: `EMPTY_BID_DRAFT`, `isPristineDraft`(Task 1), `toast`(`@/lib/toast`), `ConfirmDialog`(이미 import됨), `useBidDraft`, `bidToDraft`.
- Produces: 위저드 동작 변경 — 묻는 배너 없음, 마운트 시 의미 있는 초안 자동 복원 + 토스트, 사이드바 `초기화` 버튼 + 확인 다이얼로그. (Task 3가 의존하는 새 식별자 없음.)

이 태스크는 같은 파일/테스트에 여러 편집을 하므로, 한 번에 RED를 만들고(테스트 교체) 한 번에 GREEN(구현)으로 간다.

- [ ] **Step 1: 실패하는 테스트로 교체**

`components/inbox/bid-wizard/__tests__/BidWizard.test.tsx` 수정.

(a) 토스트 mock 추가 — 다른 `vi.mock(...)` 블록들 근처(예: `vi.mock('@/lib/server/actions/bid', ...)` 위)에 추가:
```ts
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
```

(b) `import { BidWizard } from '../BidWizard';` 아래에 추가:
```ts
import { toast } from '@/lib/toast';
```

(c) `beforeEach`의 mockClear 묶음에 토스트 클리어 추가 — `submitBidMock.mockClear();` 다음 줄:
```ts
    vi.mocked(toast).mockClear();
```

(d) `describe('BidWizard 드래프트 복원(1단계)', () => { ... })` 블록 **전체**를 아래로 교체:
```ts
describe('BidWizard 드래프트 자동 복원(1단계)', () => {
  it('드래프트 없으면 복원 토스트도 배너도 없다', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '무시' })).toBeNull();
  });

  it('의미 있는 드래프트는 묻지 않고 자동 복원 + 토스트 1회', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({ 'card:general': '0.40' }, '복원됨')));
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    // 묻는 배너/버튼 없음
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '무시' })).toBeNull();

    // 복원 토스트
    expect(toast).toHaveBeenCalledWith(
      '이전에 작성하던 내용을 그대로 불러왔어요',
      expect.objectContaining({ id: expect.stringContaining('bid-draft-restored') }),
    );

    // 폼이 이미 복원되어 있다
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect((screen.getByTestId('fee-cell-card-general') as HTMLInputElement).value).toBe('0.40');
  });

  it('빈(pristine) 드래프트는 복원/토스트하지 않는다', () => {
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({})));
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(toast).not.toHaveBeenCalled();
  });

  it('초기화 → 처음부터 다시 → 폼이 비워진다', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({ 'card:general': '0.40' })));
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    await user.click(screen.getByRole('button', { name: '초기화' }));
    await user.click(screen.getByRole('button', { name: '처음부터 다시' }));

    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect((screen.getByTestId('fee-cell-card-general') as HTMLInputElement).value).toBe('');
  });
});
```

(e) `describe('BidWizard 템플릿 적용(1단계)', ...)` 안의 `it('템플릿 선택 시 드래프트 복원 배너가 닫힌다', ...)` 테스트 **전체**를 아래로 교체(배너가 사라졌으므로 의미를 "드래프트가 복원돼 있어도 템플릿이 덮어쓴다"로 변경):
```ts
  it('드래프트가 복원돼 있어도 템플릿 선택 시 템플릿 값으로 덮어쓴다', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({ 'card:general': '0.40' })));
    const tmpl: QuoteTemplateOption = {
      id: 't1', name: '표준', settleCycle: 'M+2', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: 0.005 },
    };
    render(<BidWizard rfp={rfp} buyerName="토스" templates={[tmpl]} />);

    await user.selectOptions(
      screen.getByRole('option', { name: '표준' }).closest('select')!,
      't1',
    );
    expect((screen.getByPlaceholderText('1') as HTMLInputElement).value).toBe('2');
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect((screen.getByTestId('fee-cell-card-general') as HTMLInputElement).value).toBe('0.5');
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: FAIL — 아직 배너가 있어 `불러오기`/`무시` 버튼이 존재하고, `초기화` 버튼과 복원 토스트가 없음.

- [ ] **Step 3: 구현 — import 추가**

`components/inbox/bid-wizard/BidWizard.tsx` 상단 import에 추가:
```ts
import { toast } from '@/lib/toast';
```
그리고 `useBidDraft` import 줄을 교체:
```ts
import { useBidDraft, EMPTY_BID_DRAFT, isPristineDraft, type BidDraft } from '../useBidDraft';
```
(기존 `import { useBidDraft, type BidDraft } from '../useBidDraft';` 대체.)

- [ ] **Step 4: 구현 — 상태/초기값/이펙트 재구성**

(4-1) `resetConfirmOpen` 상태 추가 — `const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);` 다음 줄:
```ts
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
```

(4-2) `fields` 초기화 + 초안 훅 호출 순서 재구성. 기존 블록
```ts
  const [fields, setFields] = useState<BidDraft>(() =>
    initialBid
      ? bidToDraft(initialBid)
      : { __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: {}, memo: '' },
  );
```
를 아래로 교체(초안을 먼저 읽어 초기값에 반영):
```ts
  // baseline = 위저드가 처음 열렸을 때의 폼(일반=빈 폼, 재요청=직전 라운드 prefill).
  const baseline = useMemo<BidDraft>(
    () => (initialBid ? bidToDraft(initialBid) : EMPTY_BID_DRAFT),
    [initialBid],
  );
  // 초안 자동저장/복원
  const { draft, saveDraft, clearDraft, savedAt } = useBidDraft(rfpId);
  // 의미 있는 초안이면 묻지 않고 초기값으로 복원.
  const restoredFromDraft = draft !== null && !isPristineDraft(draft, baseline);
  const [fields, setFields] = useState<BidDraft>(() => (restoredFromDraft ? draft! : baseline));
```

(4-3) 기존의 초안 훅 호출 + 배너 상태 + 핸들러 블록을 정리. 기존
```ts
  // 초안 자동저장
  const { draft, saveDraft, clearDraft, savedAt } = useBidDraft(rfpId);
  const [showRestoreBanner, setShowRestoreBanner] = useState(draft !== null);
  useEffect(() => {
    saveDraft(fields);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = () => {
    if (!draft) return;
    setFields(draft);
    setShowRestoreBanner(false);
  };
  const handleDismiss = () => {
    clearDraft();
    setShowRestoreBanner(false);
  };
```
를 아래로 교체(훅 호출은 4-2로 이동했으므로 중복 제거, 배너 핸들러 삭제, 복원 토스트 이펙트 추가):
```ts
  useEffect(() => {
    saveDraft(fields);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  // 마운트 1회: 의미 있는 초안을 복원했으면 토스트로만 알린다(묻지 않음).
  useEffect(() => {
    if (restoredFromDraft) {
      toast('이전에 작성하던 내용을 그대로 불러왔어요', { id: `bid-draft-restored:${rfpId}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 5: 구현 — handleReset 추가**

`const clearProposal = useCallback(() => setProposal(null), []);` 다음 줄에 추가:
```ts
  // 처음부터 다시: 초안 삭제 + baseline 으로 폼 리셋 + 견적서 선택 해제 + 1단계로.
  const handleReset = () => {
    clearDraft();
    setFields(baseline);
    setProposal(null);
    setCurrentStep(1);
    setResetConfirmOpen(false);
  };
```

- [ ] **Step 6: 구현 — applyTemplate에서 배너 라인 제거**

`applyTemplate` 안의 다음 두 줄
```ts
    clearDraft();
    setShowRestoreBanner(false);
```
을 아래로 교체(배너 상태 삭제됨):
```ts
    clearDraft();
```

- [ ] **Step 7: 구현 — 리셋 확인 다이얼로그 추가**

기존 제출용 `<ConfirmDialog ... title="견적을 보낼까요?" ... />` 블록 **다음**에 리셋용 다이얼로그를 추가:
```tsx
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={(o) => !o && setResetConfirmOpen(false)}
        title="작성 중인 내용을 지울까요?"
        description="지금까지 입력한 정산조건·수수료·견적서가 모두 사라져요."
        confirmLabel="처음부터 다시"
        variant="danger"
        onConfirm={handleReset}
      />
```

- [ ] **Step 8: 구현 — 배너 JSX 제거**

다음 블록 **전체**를 삭제:
```tsx
      {currentStep === 1 && showRestoreBanner && (
        <div className="mb-4 flex items-center justify-between px-4 py-2.5 border border-[var(--md-sys-color-secondary-container)] rounded-[6px] bg-[var(--md-sys-color-secondary-container)]">
          <span className="text-[13px] text-[var(--md-sys-color-on-secondary-container)]">이전에 작성 중이던 내용이 있습니다</span>
          <div className="flex gap-2">
            <button type="button" onClick={handleRestore} className="text-[12px] text-[var(--md-sys-color-on-secondary-container)] underline underline-offset-2">불러오기</button>
            <button type="button" onClick={handleDismiss} className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">무시</button>
          </div>
        </div>
      )}
```

- [ ] **Step 9: 구현 — 사이드바 footer에 초기화 버튼**

`WizardStepSidebar`의 `footer` prop을 교체. 기존
```tsx
            footer={
              savedAt ? (
                <span className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
                  💾 자동저장됨 · {savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              ) : null
            }
```
를 아래로 교체:
```tsx
            footer={
              !isPristineDraft(fields, baseline) || savedAt ? (
                <div className="flex flex-col gap-1.5">
                  {!isPristineDraft(fields, baseline) && (
                    <button
                      type="button"
                      onClick={() => setResetConfirmOpen(true)}
                      className="self-start font-mono text-[10px] text-[var(--md-sys-color-outline)] underline underline-offset-2 hover:text-[var(--md-sys-color-on-surface-variant)]"
                    >
                      초기화
                    </button>
                  )}
                  {savedAt ? (
                    <span className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
                      💾 자동저장됨 · {savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  ) : null}
                </div>
              ) : null
            }
```

- [ ] **Step 10: 테스트 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS (교체한 드래프트 자동 복원 4개 + 기존 테스트 전부 green). 만약 `초기화` 버튼을 못 찾는다면, 복원된 draft가 non-pristine인지(테스트는 `card:general: '0.40'` 사용) 확인.

- [ ] **Step 11: 타입체크**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음. (`showRestoreBanner`/`handleRestore`/`handleDismiss` 잔존 참조가 없어야 함 — 있으면 미사용/미정의 에러로 표면화.)

- [ ] **Step 12: 커밋**

```bash
git add components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "$(cat <<'EOF'
feat(bid-wizard): 초안 묻지 않고 자동 복원 + 토스트 + 사이드바 초기화

묻는 배너(불러오기/무시) 제거. 마운트 시 의미 있는 초안이면 폼을 바로
채우고 토스트 1회로 안내. 사이드바 footer에 초기화(확인 다이얼로그) 추가.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 템플릿 불러오기 상시 노출 + 빈 상태 안내 + 적용 토스트

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Test: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

**Interfaces:**
- Consumes: `toast`(Task 2에서 이미 import), `applyTemplate`(기존), `Link`(`next/link`, 신규 import).
- Produces: 1단계 템플릿 섹션이 `templates.length`와 무관하게 항상 렌더. 0개면 빈 상태 안내 + `/quote-templates` 링크. 템플릿 적용 시 토스트.

- [ ] **Step 1: 실패하는 테스트 추가**

`components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`의 `describe('BidWizard 템플릿 적용(1단계)', () => { ... })` 안에 테스트 2개 추가.

(a) 빈 상태 테스트:
```ts
  it('저장된 템플릿이 0개면 빈 상태 안내와 관리 링크를 보인다', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" templates={[]} />);
    expect(screen.getByText(/저장된 견적 템플릿이 없어요/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '템플릿 관리' });
    expect(link).toHaveAttribute('href', '/quote-templates');
  });
```

(b) 적용 토스트 테스트:
```ts
  it('템플릿 적용 시 토스트로 알린다', async () => {
    const user = userEvent.setup();
    const tmpl: QuoteTemplateOption = {
      id: 't1', name: '표준', settleCycle: 'M+2', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: 0.005 },
    };
    render(<BidWizard rfp={rfp} buyerName="토스" templates={[tmpl]} />);
    await user.selectOptions(
      screen.getByRole('option', { name: '표준' }).closest('select')!,
      't1',
    );
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('표준'));
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: FAIL — `templates={[]}`면 현재 템플릿 섹션이 `templates.length > 0` 게이트로 렌더되지 않아 빈 상태 텍스트/링크 없음. 적용 토스트도 아직 없음.

- [ ] **Step 3: 구현 — Link import 추가**

`components/inbox/bid-wizard/BidWizard.tsx` 상단(다른 import 근처, 예: `import { useRouter } from 'next/navigation';` 다음 줄)에 추가:
```ts
import Link from 'next/link';
```

- [ ] **Step 4: 구현 — applyTemplate에 토스트 추가**

`applyTemplate`의 `setFields((f) => ({ ... }));` 호출 **다음**에 추가:
```ts
    toast(`‘${t.name}’ 템플릿을 불러왔어요`);
```

- [ ] **Step 5: 구현 — 1단계 템플릿 섹션 상시 노출 + 빈 상태**

기존 1단계 블록
```tsx
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
                  <BidStepSettlementContainer />
                </div>
              )}
```
를 아래로 교체:
```tsx
              {currentStep === 1 && (
                <div className="space-y-8">
                  <div className="space-y-1">
                    <Label size="md" muted={false}>견적 템플릿 불러오기</Label>
                    {templates.length > 0 ? (
                      <Select
                        options={[{ value: '', label: '템플릿 선택…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
                        value=""
                        onChange={(id) => {
                          const t = templates.find((x) => x.id === id);
                          if (t) applyTemplate(t);
                        }}
                      />
                    ) : (
                      <div className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                        저장된 견적 템플릿이 없어요. 자주 쓰는 정산조건·수수료를 템플릿으로 저장하면 다음부터 한 번에 불러올 수 있어요.{' '}
                        <Link
                          href="/quote-templates"
                          className="text-[var(--md-sys-color-primary)] underline underline-offset-2"
                        >
                          템플릿 관리
                        </Link>
                      </div>
                    )}
                  </div>
                  <BidStepSettlementContainer />
                </div>
              )}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
Expected: PASS (빈 상태 + 적용 토스트 + 기존 테스트 전부 green).

- [ ] **Step 7: 커밋**

```bash
git add components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "$(cat <<'EOF'
feat(bid-wizard): 템플릿 불러오기 상시 노출 + 빈 상태 안내 + 적용 토스트

저장 템플릿 0개여도 1단계에 템플릿 섹션을 항상 노출하고, 0개면 안내문 +
/quote-templates 링크를 보인다. 템플릿 적용 시 토스트로 알린다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 전체 검증(health)

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: 타입체크**

Run: `pnpm tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: 에러 0. (사용하지 않는 import/변수 — 예: 잔존 `useState`가 더 필요 없는 경우 — 발견 시 정리.)

- [ ] **Step 3: 관련 테스트 그린 확인**

Run: `pnpm test components/inbox`
Expected: `useBidDraft`·`BidWizard` 포함 모든 inbox 테스트 PASS.

- [ ] **Step 4: 전체 스위트(가능하면)**

Run: `pnpm test`
Expected: 전체 green. (메모리 주의: 다른 워크트리/`pnpm dev` 동시 실행 시 swap-thrash로 느려질 수 있음 — 단독 실행 권장. 단일 파일 green이 1차 게이트.)

- [ ] **Step 5: 변경 없음 재확인**

`git diff --stat origin/dev`로 변경 파일이 아래 4개뿐인지 확인:
- `components/inbox/useBidDraft.ts`
- `components/inbox/__tests__/useBidDraft.test.ts`
- `components/inbox/bid-wizard/BidWizard.tsx`
- `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`
- (+ `docs/superpowers/{specs,plans}/...` 문서)

서버/DB/액션/스키마 파일이 포함되면 안 됨.

---

## Self-Review

**1. Spec coverage:**
- 스펙 §3 초안 자동 복원(배너 제거 + 토스트) → Task 2 ✓ (저장 게이트는 더 단순한 복원 게이트로 실현, architecture에 명시)
- 스펙 §3 "의미 있는 초안만"(`복원한 내용이 있다면`) → Task 1 `isPristineDraft` + Task 2 복원 게이트 ✓
- 스펙 §4 사이드바 초기화 + 확인 + baseline 리셋 + 견적서 해제 → Task 2 (handleReset, ConfirmDialog) ✓
- 스펙 §5 템플릿 상시 노출 + 빈 상태 + 링크 + 적용 토스트 → Task 3 ✓
- 스펙 §6 UX 문구 → Task 2/3에 정확한 문자열 명시 ✓
- 스펙 §7 변경 파일 4개, 서버/DB 무변경 → Task 4 Step 5 가드 ✓
- 스펙 §8 테스트 계획 → Task 1·2·3 테스트 ✓

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 단계에 실제 코드 블록 포함 ✓

**3. Type consistency:**
- `EMPTY_BID_DRAFT: BidDraft`, `isPristineDraft(d, baseline): boolean` — Task 1 정의와 Task 2 사용 일치 ✓
- `ConfirmDialog` `variant="danger"` — 실제 props(`'danger'|'default'`)와 일치 ✓
- `toast(message, { id })` — 실제 시그니처와 일치 ✓
- 토스트 문자열은 §6과 테스트(`stringContaining('표준')`, 정확 매치 '이전에 작성하던 내용을 그대로 불러왔어요')에서 일관 ✓

## Execution Handoff (작성자 채움 후 사용자에게 제시)
