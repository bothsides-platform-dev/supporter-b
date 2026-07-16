# 튜토리얼 오픈 샌드박스 전환 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 튜토리얼(/tutorial)의 클릭-온리 계약을 오픈 샌드박스 계약으로 교체 — 키보드락·클릭 실드·넛지 제거, 막힘 감지 힌트, 이탈 확인 다이얼로그, 백엔드 터치포인트 무력화.

**Architecture:** 코치마크의 차단 레이어(4-rect 실드·info root 흡수·keyboard lock)를 걷어내고 진행 메커니즘(문서 capture 클릭 리스너·notFound 자동 스킵)은 그대로 둔다. `useAnchorRect`가 타깃 disabled를 추가 보고해 말풍선 힌트를 구동하고, 신설 `TutorialLeaveGuard`가 이탈 링크를 가로채 스탬프 확인을 받는다. 실 서버 터치 2곳(첨부 업로드·템플릿 저장)은 sample 모드에서 스텁.

**Tech Stack:** Next.js 16 App Router, React 19, Vitest + @testing-library/react (jsdom), Playwright e2e.

**설계 스펙:** `docs/superpowers/specs/2026-07-16-tutorial-open-sandbox-design.md` (승인 완료)

## Global Constraints

- 워크트리 `feat/tutorial-open-sandbox` (이 디렉터리에서만 작업, 절대 경로도 워크트리 하위로).
- TDD Iron Law: 실패 테스트 먼저 → `pnpm test <단일 파일 경로>`로 RED 직접 확인 → 최소 구현 → GREEN. 카피·문서 전용 변경(Task 8)만 면제.
- 태스크별 커밋. pre-commit 훅(풀레포 lint+tsc, 수 분)은 `--no-verify`로 생략하고 Task 9에서 전체 게이트 실행.
- 커밋 메시지 끝에:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01VuSHGAhpqYnk7K3SkEj6Tw`
- UI 문구는 UX_WRITING.md 해요체. 모션은 transform/opacity만(DESIGN.md 하드룰).
- `git stash` 금지 (스택이 메인 체크아웃과 공유됨).
- 유지 불변식: 무입력 클릭 완주, 건너뛰기 버튼=completed+done 점프, Esc 무반응, notFound 자동 스킵, 컨페티 done 전용 마운트.

---

### Task 1: CoachmarkOverlay 실드·넛지 제거 + info 비차단

**Files:**
- Modify: `components/onboarding/coachmarks/CoachmarkOverlay.tsx`
- Modify: `app/globals.css` (165~197행 부근 `.coachmark-nudge` 블록)
- Test: `components/onboarding/coachmarks/__tests__/CoachmarkOverlay.test.tsx`

**Interfaces:**
- Consumes: 없음 (독립)
- Produces: `CoachmarkOverlay`는 실드/넛지 없이 렌더 — root 항상 `pointer-events-none`, 말풍선만 `pointer-events: auto`. Props 형태는 기존 유지(`rect, step, stepIndex, stepCount, onNext, onSkip, isLast`).

- [ ] **Step 1: 기존 실드·넛지 테스트 삭제 + 새 실패 테스트 작성**

CoachmarkOverlay.test.tsx에서 다음 it 블록을 **삭제**한다 (실드·넛지 계약 — 모두 폐기):
- `'실드는 배경색 없는 투명 클릭 실드다 (dim 스크림 제거)'` (165행)
- `'info 스텝에서 말풍선 밖(root) 클릭 시 말풍선 내부 래퍼에 유도 플래시(coachmark-nudge)가 등장한다'` (223행)
- `'밖 클릭으로 유도 플래시가 붙어도 dialog(role=dialog) DOM 노드는 리마운트되지 않는다 (포커스 안전)'` (244행)
- `'유도 플래시 애니메이션 종료(animationend) 후 클래스가 제거되고, 다시 밖 클릭하면 재부착되어 재생된다 (리마운트 없는 replay)'` (265행)
- `'다른 애니메이션의 animationend(자손 버블링 포함)는 유도 플래시를 리셋하지 않는다'` (290행)
- `'info 스텝에서 밖 클릭은 링에는 유도 플래시를 붙이지 않는다 (말풍선에만)'` (313행)
- `'step 전환(target도 바뀜) 시 이전 step의 유도 플래시가 새 step으로 이어지지 않는다'` (332행)
- `'같은 target을 쓰는 연속 step이라도 stepIndex가 바뀌면 이전 step의 유도 플래시가 새 step으로 이어지지 않는다'` (371행)
- `'info 스텝에서 말풍선 내부 클릭은 유도 플래시를 발동시키지 않는다'` (409행)
- action describe 내 `'구멍 주위 4개 클릭 실드를 렌더하고 각각 pointer-events:auto로 밖 클릭을 흡수한다'` (483행)
- action describe 내 `'실드(밖) 클릭 시 링에 유도 플래시(coachmark-nudge) 클래스가 등장한다'` (502행)

같은 파일에 **추가** (파일의 기존 render 헬퍼·props 픽스처를 재사용하되, 없으면 아래처럼 직접 구성):

```tsx
describe('오픈 샌드박스 (차단 없음)', () => {
  it('클릭 실드를 렌더하지 않는다 (action/info 공통)', () => {
    for (const kind of ['action', 'info'] as const) {
      const { unmount } = render(
        <CoachmarkOverlay
          rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
          step={{ target: 't', kind, title: '제목', body: '본문', placement: 'top' }}
          stepIndex={0}
          stepCount={2}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      expect(document.querySelectorAll('[data-slot="coachmark-shield"]')).toHaveLength(0);
      unmount();
    }
  });

  it('info 스텝 root도 pointer-events-none — 밖 클릭을 흡수하지 않는다', () => {
    render(
      <CoachmarkOverlay
        rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
        step={{ target: 't', kind: 'info', title: '제목', body: '본문', placement: 'top' }}
        stepIndex={0}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = document.querySelector('[data-slot="coachmark-overlay"]')!;
    expect(root.className).toContain('pointer-events-none');
  });

  it('말풍선은 두 kind 모두 pointer-events:auto — 버튼이 눌린다', () => {
    for (const kind of ['action', 'info'] as const) {
      const { unmount } = render(
        <CoachmarkOverlay
          rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
          step={{ target: 't', kind, title: '제목', body: '본문', placement: 'top' }}
          stepIndex={0}
          stepCount={2}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.style.pointerEvents).toBe('auto');
      unmount();
    }
  });

  it('coachmark-nudge 클래스는 어디에도 등장하지 않는다', () => {
    render(
      <CoachmarkOverlay
        rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
        step={{ target: 't', kind: 'action', title: '제목', body: '본문', placement: 'top' }}
        stepIndex={0}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    expect(document.querySelector('.coachmark-nudge')).toBeNull();
    expect(document.querySelector('[data-slot="coachmark-bubble-flash"]')).toBeNull();
  });
});
```

기존의 `'root가 pointer-events:none이고 클릭 흡수 onClick이 없다'`(467행, action) · 펄스/페이드/클램프/건너뛰기/다음 버튼 테스트는 유지한다.

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/onboarding/coachmarks/__tests__/CoachmarkOverlay.test.tsx`
Expected: 새 테스트 4개 FAIL (실드 4개 존재·info root 흡수·nudge 존재).

- [ ] **Step 3: CoachmarkOverlay.tsx 구현**

다음을 적용한다:
1. `nudge` state, `isNudging`, `handleNudge`, `ringNudgeClass`, `bubbleNudgeClass` 삭제.
2. `shieldBase`/`shieldRects`/`shields` 전부 삭제.
3. 말풍선: `data-slot="coachmark-bubble-flash"` 래퍼 div의 클래스·ref(animationend 리스너)를 제거하고 자식들을 그대로 유지(래퍼 div 자체를 벗겨도 됨). 말풍선 root의 `onClick={(e)=>e.stopPropagation()}` 제거. style은 kind 무관하게 `{ ...computeBubbleStyle(rect, step.placement), pointerEvents: 'auto' }`.
4. 링: `key={`ring-${step.target}`}`로 단순화(넛지 count 제거), `className={pulseClass}`.
5. 반환부를 단일 형태로 통일 (info 분기의 root onClick 흡수 삭제):

```tsx
return (
  <div data-slot="coachmark-overlay" className="fixed inset-0 z-50 pointer-events-none">
    {ring}
    {bubble}
  </div>
);
```

6. 파일 상단 주석(실드/넛지 언급)을 오픈 샌드박스 계약으로 갱신: 오버레이는 차단하지 않는다 — 진행은 CoachmarkTour의 capture 클릭(action)·말풍선 다음 버튼(info).

- [ ] **Step 4: globals.css 넛지 블록 삭제**

`app/globals.css`에서 `.coachmark-nudge` 주석 블록(약 164~175행)과 `@keyframes coachmark-nudge`(약 176~180행)를 삭제하고, 두 미디어 블록을 아래처럼 축소한다 (`.coachmark-pulse` 규칙만 유지):

```css
@media (prefers-reduced-motion: no-preference) {
  .coachmark-pulse {
    animation: coachmark-fade-in 150ms ease-out, coachmark-pulse 1.8s ease-in-out infinite;
  }
}
@media (prefers-reduced-motion: reduce) {
  .coachmark-pulse {
    animation: none;
  }
}
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test components/onboarding/coachmarks/__tests__/CoachmarkOverlay.test.tsx`
Expected: PASS (전체).

Run: `pnpm test components/onboarding/coachmarks`
Expected: PASS (CoachmarkTour 테스트의 `'타깃 밖 클릭은 진행하지 않는다'` 등은 실드와 무관 — 진행 로직 불변이라 통과해야 함).

- [ ] **Step 6: Commit**

```bash
git add components/onboarding/coachmarks app/globals.css
git commit --no-verify -m "feat(coachmark): 실드·넛지 제거 — 오픈 샌드박스 비차단 오버레이"
```

---

### Task 2: useAnchorRect — 타깃 disabled 보고

**Files:**
- Modify: `components/onboarding/coachmarks/useAnchorRect.ts`
- Test: `components/onboarding/coachmarks/__tests__/useAnchorRect.test.ts`

**Interfaces:**
- Produces: `AnchorRectResult = { rect: DOMRect | null; status: AnchorStatus; disabled: boolean }` — Task 3이 소비. searching/notFound 시 `disabled: false`.

- [ ] **Step 1: 실패 테스트 작성** (파일의 기존 타이머 패턴 — 158행 폴링 테스트와 동일한 방식 — 을 따른다)

```ts
it('타깃 버튼이 disabled면 disabled=true, 해제되면 폴링 tick에서 false로 갱신한다', async () => {
  const btn = document.createElement('button');
  btn.setAttribute('data-coachmark', 'dis-target');
  btn.disabled = true;
  document.body.appendChild(btn);

  const { result } = renderHook(() => useAnchorRect('dis-target'));
  await waitFor(() => expect(result.current.status).toBe('found'));
  expect(result.current.disabled).toBe(true);

  btn.disabled = false;
  await waitFor(() => expect(result.current.disabled).toBe(false));
});

it('aria-disabled="true"도 disabled로 판정한다', async () => {
  const el = document.createElement('div');
  el.setAttribute('data-coachmark', 'aria-target');
  el.setAttribute('aria-disabled', 'true');
  document.body.appendChild(el);

  const { result } = renderHook(() => useAnchorRect('aria-target'));
  await waitFor(() => expect(result.current.status).toBe('found'));
  expect(result.current.disabled).toBe(true);
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/onboarding/coachmarks/__tests__/useAnchorRect.test.ts`
Expected: FAIL — `disabled` 프로퍼티 undefined.

- [ ] **Step 3: 구현**

```ts
export type AnchorRectResult = {
  rect: DOMRect | null;
  status: AnchorStatus;
  disabled: boolean;
};
```

- 초기/리셋 state: `{ rect: null, status: 'searching', disabled: false }`, notFound 전환 두 곳도 `disabled: false` 포함.
- 판정 헬퍼 추가:

```ts
function isDisabledEl(el: HTMLElement): boolean {
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
}
```

- `updateRect` 내에서 rect와 함께 disabled를 읽고, **중복 set 방지 key에 disabled를 포함**한다 (rect가 안 변해도 disabled 토글이 반영되도록 — 이걸 빼먹으면 첫 테스트의 해제 케이스가 실패한다):

```ts
const disabled = isDisabledEl(trackedEl);
const key = `${rect.top},${rect.left},${rect.width},${rect.height},${disabled}`;
if (key === lastKey) return;
lastKey = key;
setResult({ rect, status: 'found', disabled });
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/onboarding/coachmarks/__tests__/useAnchorRect.test.ts`
Expected: PASS (기존 테스트가 `disabled` 부재를 단언하지 않는지 확인 — result 전체 `toEqual` 비교가 있으면 `disabled: false`를 추가).

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/coachmarks
git commit --no-verify -m "feat(coachmark): useAnchorRect 타깃 disabled 폴링 보고"
```

---

### Task 3: 막힘 감지 힌트 — Overlay targetDisabled + Tour 배선

**Files:**
- Modify: `components/onboarding/coachmarks/CoachmarkOverlay.tsx`
- Modify: `components/onboarding/coachmarks/CoachmarkTour.tsx`
- Test: `components/onboarding/coachmarks/__tests__/CoachmarkOverlay.test.tsx`, `components/onboarding/coachmarks/__tests__/CoachmarkTour.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `disabled` 반환값.
- Produces: `CoachmarkOverlayProps.targetDisabled?: boolean`. 힌트 문구(고정): `입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.`

- [ ] **Step 1: 실패 테스트 작성**

CoachmarkOverlay.test.tsx에 추가:

```tsx
describe('막힘 감지 힌트', () => {
  const base = {
    rect: { top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect,
    stepIndex: 0,
    stepCount: 2,
    onNext: () => {},
    onSkip: () => {},
    isLast: false,
  };
  const HINT = '입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.';

  it('action 스텝 + targetDisabled면 힌트를 렌더한다', () => {
    render(
      <CoachmarkOverlay
        {...base}
        step={{ target: 't', kind: 'action', title: '제목', body: '본문', placement: 'top' }}
        targetDisabled
      />,
    );
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it('targetDisabled가 아니면 힌트가 없다', () => {
    render(
      <CoachmarkOverlay
        {...base}
        step={{ target: 't', kind: 'action', title: '제목', body: '본문', placement: 'top' }}
      />,
    );
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('info 스텝은 targetDisabled여도 힌트가 없다 (진행이 말풍선 버튼이므로)', () => {
    render(
      <CoachmarkOverlay
        {...base}
        step={{ target: 't', kind: 'info', title: '제목', body: '본문', placement: 'top' }}
        targetDisabled
      />,
    );
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });
});
```

CoachmarkTour.test.tsx에 추가 (파일의 기존 타깃 DOM 셋업 패턴 재사용):

```tsx
it('action 타깃이 disabled면 말풍선에 막힘 힌트가 나타난다', async () => {
  const btn = document.createElement('button');
  btn.setAttribute('data-coachmark', 'stuck');
  btn.disabled = true;
  document.body.appendChild(btn);

  render(
    <CoachmarkTour
      steps={[{ target: 'stuck', kind: 'action', title: 'T', body: 'B', placement: 'top' }]}
    />,
  );
  expect(
    await screen.findByText('입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.'),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/onboarding/coachmarks`
Expected: 새 테스트 4개 FAIL.

- [ ] **Step 3: 구현**

CoachmarkOverlay: props에 `targetDisabled?: boolean` 추가, 말풍선 body `<p>` 아래에:

```tsx
{isAction && targetDisabled && (
  <p className="mt-2 text-[12px] text-[var(--md-sys-color-error)]">
    입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.
  </p>
)}
```

CoachmarkTour: `const { rect, status, disabled } = useAnchorRect(...)` 로 받고 `<CoachmarkOverlay ... targetDisabled={disabled} />` 전달.

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/onboarding/coachmarks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/coachmarks
git commit --no-verify -m "feat(coachmark): 타깃 disabled 막힘 감지 힌트"
```

---

### Task 4: 키보드 락 삭제 + e2e 타이핑 단언 반전

**Files:**
- Delete: `components/onboarding/tutorial/useTutorialKeyboardLock.ts`, `components/onboarding/tutorial/__tests__/useTutorialKeyboardLock.test.tsx`
- Modify: `components/onboarding/tutorial/BuyerTutorialFlow.tsx` (17행 import, 50행 호출+주석), `components/onboarding/tutorial/PgTutorialFlow.tsx` (22행 import, 50행 호출+주석)
- Modify: `components/onboarding/tutorial/__tests__/BuyerTutorialFlow.test.tsx` (44~46행 mock), `components/onboarding/tutorial/__tests__/PgTutorialFlow.test.tsx` (39~41행 mock) — `keyboardLockMock` 선언·단언도 함께 제거
- Modify: `e2e/tutorial-click-through.spec.ts` (73~82행)

**Interfaces:**
- Consumes/Produces: 없음 (삭제 태스크). 이후 태스크는 키보드 락이 없다고 가정.

- [ ] **Step 1: e2e 단언 반전** (새 행동의 명세 — RED는 e2e 환경에서만 확인 가능하므로 문서적 선행)

`e2e/tutorial-click-through.spec.ts` 73~82행의 키보드 락 블록을 다음으로 교체:

```ts
    // 오픈 샌드박스: 프리필 값을 자유롭게 수정할 수 있다 (수정 후 원상 복구해 진행).
    const title = page.locator('input').first();
    await title.waitFor({ state: 'visible' });
    const before = await title.inputValue();
    expect(before).not.toBe('');
    await title.click({ force: true });
    await title.press('End');
    await page.keyboard.type('!');
    expect(await title.inputValue()).toBe(`${before}!`);
    await page.keyboard.press('Backspace');
    expect(await title.inputValue()).toBe(before);
```

- [ ] **Step 2: 훅·테스트 삭제 + 플로우에서 제거**

```bash
git rm components/onboarding/tutorial/useTutorialKeyboardLock.ts components/onboarding/tutorial/__tests__/useTutorialKeyboardLock.test.tsx
```

두 플로우에서 `useTutorialKeyboardLock` import와 호출("튜토리얼은 클릭 전용 — …" 주석 포함)을 삭제. 두 플로우 테스트에서 `vi.mock('../useTutorialKeyboardLock', …)` 블록·`keyboardLockMock` 선언·이를 참조하는 단언 삭제.

- [ ] **Step 3: 플로우 테스트 GREEN 확인**

Run: `pnpm test components/onboarding/tutorial`
Expected: PASS. (import가 남아 있으면 module not found로 즉사 — 그게 이 삭제의 회귀 신호.)

- [ ] **Step 4: (가능하면) e2e 확인**

Run: `docker start supporter-b-pg-test && pnpm e2e:reset && pnpm e2e e2e/tutorial-click-through.spec.ts`
Expected: 2/2 PASS. 테스트 DB(5433) 없으면 스킵하고 Task 9에서 실행.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-verify -m "feat(tutorial): 키보드 락 제거 — 입력 개방 (e2e 단언 반전)"
```

---

### Task 5: TutorialLeaveGuard — 이탈 확인 다이얼로그

**Files:**
- Create: `components/onboarding/tutorial/TutorialLeaveGuard.tsx`
- Test: `components/onboarding/tutorial/__tests__/TutorialLeaveGuard.test.tsx`
- Modify: `components/onboarding/tutorial/BuyerTutorialFlow.tsx`, `components/onboarding/tutorial/PgTutorialFlow.tsx` (마운트)

**Interfaces:**
- Produces: `TutorialLeaveGuard({ variant }: { variant: 'buyer' | 'pg' })` — done phase 제외 마운트.
- Consumes: `updateOnboardingAction({ key, event })` (기존), `@/components/ui/dialog`, `@/components/primitives/Button`.

- [ ] **Step 1: 실패 테스트 작성** — `TutorialLeaveGuard.test.tsx` 신규 (Dialog jsdom 셋업은 `components/onboarding/__tests__/WelcomeModal.test.tsx`의 것을 미러)

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const updateOnboardingMock = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

import { TutorialLeaveGuard } from '../TutorialLeaveGuard';

// jsdom은 실제 내비게이션이 없으므로 pass-through 케이스의 콘솔 에러를 막기 위해
// 링크에 버블 단계 preventDefault를 단다(가드는 capture 단계라 영향 없음).
function renderWithLink(href: string, attrs: Record<string, string> = {}) {
  render(<TutorialLeaveGuard variant="buyer" />);
  const a = document.createElement('a');
  a.href = href;
  a.textContent = 'link';
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.addEventListener('click', (e) => e.preventDefault());
  document.body.appendChild(a);
  return a;
}

beforeEach(() => {
  pushMock.mockClear();
  updateOnboardingMock.mockClear();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('TutorialLeaveGuard', () => {
  it('/tutorial 밖 내부 링크 클릭을 가로채 확인 다이얼로그를 띄운다', async () => {
    const a = renderWithLink('/quote-templates');
    await userEvent.click(a);
    expect(await screen.findByText('튜토리얼을 나갈까요?')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('나중에 하기 → dismissed 스탬프 후 목적지로 이동한다', async () => {
    const a = renderWithLink('/home');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '나중에 하기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerTutorial', event: 'dismissed' });
    expect(pushMock).toHaveBeenCalledWith('/home');
  });

  it('건너뛰기 → completed 스탬프 후 목적지로 이동한다', async () => {
    const a = renderWithLink('/rfp');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '건너뛰기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerTutorial', event: 'completed' });
    expect(pushMock).toHaveBeenCalledWith('/rfp');
  });

  it('계속 체험하기 → 잔류(스탬프·이동 없음)', async () => {
    const a = renderWithLink('/home');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '계속 체험하기' }));
    await waitFor(() =>
      expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument(),
    );
    expect(updateOnboardingMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('/tutorial 내부 링크·수정키 클릭·target=_blank는 가로채지 않는다', async () => {
    const inTutorial = renderWithLink('/tutorial');
    await userEvent.click(inTutorial);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();

    const blank = document.createElement('a');
    blank.href = '/home';
    blank.setAttribute('target', '_blank');
    blank.textContent = 'blank';
    blank.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(blank);
    await userEvent.click(blank);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();

    const meta = document.createElement('a');
    meta.href = '/home';
    meta.textContent = 'meta';
    meta.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(meta);
    const user = userEvent.setup();
    await user.keyboard('{Meta>}');
    await user.click(meta);
    await user.keyboard('{/Meta}');
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/onboarding/tutorial/__tests__/TutorialLeaveGuard.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `TutorialLeaveGuard.tsx`

```tsx
'use client';

// 튜토리얼 화면에서 /tutorial 밖 내부 링크 클릭을 가로채 확인을 받는 이탈 가드.
// [계속 체험하기]=잔류, [나중에 하기]=dismissed 스탬프 후 이동, [건너뛰기]=completed
// 스탬프 후 이동(코치마크 건너뛰기 버튼과 스탬프 의미 동일 — done 화면만 생략).
// router.push 프로그래매틱 이동·브라우저 뒤로가기는 잡지 않는다(수용한 한계 —
// 무스탬프 이탈은 다음 홈 방문 시 환영 모달 재노출로 흡수). Next Link는
// defaultPrevented를 존중하므로 capture preventDefault로 내비게이션이 멈춘다.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import type { OnboardingKey } from '@/lib/types/onboarding';

const KEY_FOR_VARIANT: Record<'buyer' | 'pg', OnboardingKey> = {
  buyer: 'buyerTutorial',
  pg: 'pgTutorial',
};

export function TutorialLeaveGuard({ variant }: { variant: 'buyer' | 'pg' }) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const el = event.target instanceof Element ? event.target : null;
      const anchor = el?.closest('a[href]');
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('/')) return;
      if (href === '/tutorial' || href.startsWith('/tutorial/') || href.startsWith('/tutorial?'))
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  const leave = (eventType: 'dismissed' | 'completed') => {
    const href = pendingHref;
    if (!href) return;
    void updateOnboardingAction({ key: KEY_FOR_VARIANT[variant], event: eventType }).catch(
      () => {},
    );
    setPendingHref(null);
    router.push(href);
  };

  return (
    <Dialog open={pendingHref !== null} onOpenChange={(next) => { if (!next) setPendingHref(null); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>튜토리얼을 나갈까요?</DialogTitle>
          <DialogDescription>지금 나가도 홈에서 언제든 다시 시작할 수 있어요.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="text" size="sm" onClick={() => leave('completed')}>
            건너뛰기
          </Button>
          <Button variant="outlined" size="sm" onClick={() => leave('dismissed')}>
            나중에 하기
          </Button>
          <Button size="sm" onClick={() => setPendingHref(null)}>
            계속 체험하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/onboarding/tutorial/__tests__/TutorialLeaveGuard.test.tsx`
Expected: PASS. (Dialog 렌더에 jsdom 폴리필이 필요하면 WelcomeModal.test.tsx의 스텁을 복사.)

- [ ] **Step 5: 플로우에 마운트** (done 제외)

두 플로우의 최상위 `<div className="flex flex-1 flex-col">` 바로 안쪽에:

```tsx
{phase !== 'done' && <TutorialLeaveGuard variant="buyer" />}
```

(PgTutorialFlow는 `variant="pg"`.) import 추가. 플로우 테스트가 깨지면(다이얼로그 포털 등) 두 테스트 파일에 `vi.mock('../TutorialLeaveGuard', () => ({ TutorialLeaveGuard: () => null }))` 추가 — 가드 자체 검증은 전용 테스트가 담당.

- [ ] **Step 6: GREEN + Commit**

Run: `pnpm test components/onboarding/tutorial`
Expected: PASS.

```bash
git add components/onboarding/tutorial
git commit --no-verify -m "feat(tutorial): 이탈 확인 다이얼로그 — 나중에 하기/건너뛰기 스탬프 후 이동"
```

---

### Task 6: 첨부 드롭존 sampleMode — 가상 첨부

**Files:**
- Modify: `components/rfp/RfpAttachmentDropzone.tsx`
- Modify: `components/rfp/RfpStep2Content.tsx` (Props + 281행 전달)
- Modify: `components/rfp/RfpCreateWizard.tsx` (295행 전달)
- Test: `components/rfp/__tests__/RfpAttachmentDropzone.test.tsx`

**Interfaces:**
- Produces: `RfpAttachmentDropzone` prop `sampleMode?: boolean`, `RfpStep2Content` prop `sampleMode?: boolean`. 위저드는 `sampleMode={Boolean(onSampleSubmit)}` 전달.

- [ ] **Step 1: 실패 테스트 작성** — 기존 테스트 파일의 upload-client mock 패턴 재사용

```tsx
it('sampleMode에서는 업로드 호출 없이 즉시 ready 행으로 추가한다 (튜토리얼 샌드박스)', async () => {
  const onChange = vi.fn();
  render(<RfpAttachmentDropzone value={[]} onChange={onChange} sampleMode />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'sample.pdf', { type: 'application/pdf' }));

  expect(uploadAttachment).not.toHaveBeenCalled();
  expect(screen.getByText('sample.pdf')).toBeInTheDocument();
  expect(screen.queryByText('UPLOADING…')).not.toBeInTheDocument();
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'sample.pdf', status: 'ready' }),
    ]),
  );
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/rfp/__tests__/RfpAttachmentDropzone.test.tsx`
Expected: FAIL (sampleMode prop 없음 → 실제 업로드 경로로 진입, uploadAttachment 호출됨).

- [ ] **Step 3: 구현**

Props에 `sampleMode?: boolean` 추가하고 `addFiles` 루프 내 업로드 분기를 교체:

```ts
if (sampleMode) {
  // 튜토리얼 샌드박스 — 서버 업로드 없이 로컬 행만 만든다(실 R2 흔적 금지).
  additions.push({
    id: `sample-${Math.random().toString(36).slice(2, 10)}`,
    name: f.name,
    size: f.size,
    status: 'ready',
  });
} else {
  const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
  additions.push({ id: tempId, name: f.name, size: f.size, status: 'uploading' });
  void uploadOne(f, tempId);
}
```

RfpStep2Content: Props에 `/** 튜토리얼 샌드박스 — 첨부를 가상 처리 */ sampleMode?: boolean;` 추가, 시그니처에 받아 `<RfpAttachmentDropzone value={...} onChange={...} sampleMode={sampleMode} />`.

RfpCreateWizard 295행:

```tsx
<RfpStep2Content onBack={back} onNext={advance} showFieldErrors={failedSteps.has(2)} websiteRejected={websiteRejected} sampleMode={Boolean(onSampleSubmit)} />
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/rfp/__tests__/RfpAttachmentDropzone.test.tsx`
Expected: PASS (기존 실제 업로드 경로 테스트 포함).

- [ ] **Step 5: Commit**

```bash
git add components/rfp
git commit --no-verify -m "feat(tutorial): 첨부 드롭존 sampleMode — 가상 첨부(실 업로드 차단)"
```

---

### Task 7: BidWizard 템플릿 저장 스텁 (샘플 모드)

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx` (218행 `onSaveTemplate`)
- Test: `components/inbox/bid-wizard/__tests__/BidWizard.tutorial.test.tsx`

**Interfaces:**
- Consumes: 기존 `onSampleSubmit` prop, `toast`, `saveQuoteTemplateAction`.
- Produces: 샘플 모드에서 `onSaveTemplate`는 액션 미호출 + 토스트 `튜토리얼에서는 저장되지 않아요` + `{ ok: true }` 반환(저장 폼은 정상 닫힘).

- [ ] **Step 1: 실패 테스트 작성** — BidWizard.tutorial.test.tsx에 추가 (파일 상단에 `saveQuoteTemplateAction` mock을 spy 참조로 노출: 기존 `vi.mock` 팩토리의 `vi.fn`을 상수로 끌어올려 단언 가능하게 수정)

```tsx
it('onSampleSubmit 모드에서 템플릿 저장은 실 액션을 부르지 않고 안내 토스트만 띄운다', async () => {
  const user = userEvent.setup();
  render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" onSampleSubmit={() => {}} />);

  // 4단계(검토·발송)로 이동 후 템플릿 저장 폼 오픈
  await user.click(screen.getByRole('button', { name: '검토·발송' }));
  await user.click(screen.getByRole('button', { name: '템플릿으로 저장' }));
  await user.type(screen.getByPlaceholderText('템플릿 이름'), '내 템플릿');
  await user.click(screen.getByRole('button', { name: '저장' }));

  expect(saveQuoteTemplateActionMock).not.toHaveBeenCalled();
  expect(toastMock).toHaveBeenCalledWith('튜토리얼에서는 저장되지 않아요');
});
```

(저장 버튼의 정확한 accessible name은 `BidStepReview.tsx` 147행 버튼 텍스트를 확인해 맞춘다 — name이 `'저장'`이 아니면 실제 라벨로 교체.)

- [ ] **Step 2: RED 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.tutorial.test.tsx`
Expected: FAIL — 실 액션 mock이 호출됨 + 안내 토스트 부재.

- [ ] **Step 3: 구현** — `onSaveTemplate` 앞머리에 분기 추가 + deps에 `onSampleSubmit`

```ts
const onSaveTemplate = useCallback(
  async (name: string) => {
    if (onSampleSubmit) {
      // 튜토리얼 샌드박스 — 실 워크스페이스에 템플릿을 만들지 않는다.
      toast('튜토리얼에서는 저장되지 않아요');
      return { ok: true as const };
    }
    const r = await saveQuoteTemplateAction({
      name,
      settleCycle,
      settleLimit: parseInt(settleLimit) || 0,
      guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
      paymentFees: buildPaymentFees(fees, feeInputMethods),
    });
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  },
  [onSampleSubmit, settleCycle, settleLimit, guaranteeInsurance, fees, feeInputMethods],
);
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm test components/inbox/bid-wizard/__tests__/BidWizard.tutorial.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/inbox/bid-wizard
git commit --no-verify -m "feat(tutorial): 샘플 모드 템플릿 저장 스텁 — 실 액션 차단 + 안내 토스트"
```

---

### Task 8: tours.ts 카피 + 문서 3종 갱신 (TDD 면제 — 카피/문서 전용)

**Files:**
- Modify: `components/onboarding/tutorial/tours.ts`
- Modify: `CLAUDE.md`, `SCREEN_DESIGN.md`, `DESIGN.md`

- [ ] **Step 1: tours.ts 카피**

`buyerCreateTour[0].body` →
`실제로 사용하는 화면 그대로예요. 모든 내용이 미리 채워져 있어요 — 자유롭게 바꿔보거나 눌러봐도 되고, 안내만 따라가도 돼요.`

`pgWriteTour[0].body` →
`실제로 사용하는 화면 그대로예요. 정산조건과 수수료가 미리 채워져 있어요 — 자유롭게 바꿔봐도 돼요.`

파일 상단 주석의 "튜토리얼은 입력 없이 클릭만으로 진행한다" 문단을 오픈 샌드박스로 갱신(자유 상호작용 허용, action 스텝은 타깃 클릭 대기).

- [ ] **Step 2: CLAUDE.md 튜토리얼 단락 갱신**

`app/(app)/tutorial/` 항목에서 **클릭-온리 계약(v0.2.79.0)** 문장(`useTutorialKeyboardLock`·스포트라이트 구멍 언급)과 **라이트 스포트라이트(v0.3.3.0)** 중 넛지 문장을 다음 계약으로 교체:

> **오픈 샌드박스 계약(v0.3.4.0)**: 폼은 전부 프리필(무입력 클릭 완주는 여전히 성립 — e2e/tutorial-click-through.spec.ts가 커버)이지만 차단이 없다 — 키보드락·클릭 실드·밖-클릭 넛지 제거, 사용자는 값을 바꾸고 화면을 자유롭게 탐색할 수 있다. action 코치마크는 타깃 클릭을 기다리며(진행 로직 불변), 타깃 버튼이 disabled면 말풍선에 막힘 힌트를 띄운다. /tutorial 밖 내부 링크 클릭은 TutorialLeaveGuard가 가로채 [계속 체험하기|나중에 하기(dismissed)|건너뛰기(completed)] 확인 후 이동(프로그래매틱 이동·뒤로가기는 미가드 — 무스탬프라 환영 모달 재노출로 흡수). 실 백엔드 터치는 스텁: 첨부 드롭존 sampleMode(가상 첨부), 템플릿 저장 안내 토스트. 건너뛰기 계약(v0.3.2.0)·Esc 무반응·라이트 스포트라이트 링 펄스(v0.3.3.0)는 유지.

- [ ] **Step 3: SCREEN_DESIGN.md 65행 갱신**

route map의 `/tutorial` 설명에서 "무입력 클릭-스루: 전부 프리필 + 코치마크 action 스포트라이트가 실제 버튼 클릭 유도, 키보드 편집 차단" 부분을 "오픈 샌드박스: 전부 프리필 + 코치마크가 실제 버튼 클릭을 안내(차단 없음 — 자유 입력·탐색 허용, 이탈은 확인 다이얼로그)"로 교체.

- [ ] **Step 4: DESIGN.md §6 갱신**

186행 부근 코치마크 문단에서 `.coachmark-nudge` 문장(타깃 밖 클릭 시 1회성 유도 플래시)을 삭제하고 펄스 링 문장은 유지. CLAUDE.md 라우팅 블록의 튜토리얼 항목 중 "밖 클릭 시 1회성 유도 플래시(`.coachmark-nudge`)" 언급도 함께 제거됐는지 재확인.

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/tutorial/tours.ts CLAUDE.md SCREEN_DESIGN.md DESIGN.md
git commit --no-verify -m "docs+copy(tutorial): 오픈 샌드박스 계약 문서화 및 투어 카피 갱신"
```

---

### Task 9: 최종 검증 (풀 게이트)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 타입체크** — Run: `pnpm tsc --noEmit` / Expected: 에러 0
- [ ] **Step 2: 린트** — Run: `pnpm lint` / Expected: 에러 0
- [ ] **Step 3: 전체 테스트** — Run: `pnpm test` / Expected: 전체 green (참고: BidForm draft 테스트는 통합 실행에서 ~1/4 플레이크 이력 — 단독 재실행 green이면 무시. jsdom localStorage 대량 실패는 환경 문제 — Node 22 확인)
- [ ] **Step 4: e2e** — Run: `docker start supporter-b-pg-test && pnpm e2e:reset && pnpm e2e e2e/tutorial-click-through.spec.ts` / Expected: 2/2 PASS
- [ ] **Step 5: 미커밋 잔여 확인** — Run: `git status` / Expected: clean. 잔여가 있으면 해당 태스크 커밋에 포함.

---

## 계획 자체 검토 노트

- 스펙 §3.4의 "buyer 3단계 PG 검색 감사"는 계획 수립 중 완료 — `RfpStep3PgSelect.tsx`는 서버 액션/fetch import 없이 `pgList` prop을 로컬 필터링만 한다(39행). 스텁 불필요, 태스크 없음.
- 템플릿 빈 상태의 `/quote-templates` Link(BidWizard.tsx:427)는 의도적으로 그대로 — Task 5의 가드가 잡는다(가드 테스트 첫 케이스가 정확히 이 href).
- Task 1이 삭제하는 CoachmarkTour 쪽 계약은 없음 — `'타깃 밖 클릭은 진행하지 않는다'`(156행)는 실드가 아니라 capture 리스너의 매칭 로직 검증이라 그대로 통과해야 한다.
