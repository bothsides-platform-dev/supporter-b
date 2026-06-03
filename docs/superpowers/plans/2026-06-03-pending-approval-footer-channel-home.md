# pending-approval 푸터·채널톡 노출 + 홈 버튼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/pending-approval`의 두 화면에서 푸터와 채널톡 FAB이 보이게 하고(풀스크린 오버레이 제거), "홈으로 가기" 버튼을 추가한다.

**Architecture:** `ApprovalWaitingScreen`·`EmailVerifyScreen`의 `fixed inset-0 z-50` 불투명 오버레이가 `(public)` 레이아웃의 푸터와 z-40 채널톡 FAB을 가리는 단일 원인이다. 두 화면을 레이아웃 안의 일반 흐름(in-flow) 콘텐츠로 전환한다. 콘페티는 `pointer-events-none` 투명 캔버스(`fixed inset-0 z-0`)로 유지해 클릭을 통과시킨다. 홈 버튼은 `next/link` `<Link href="/">`.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4(CSS 변수), Vitest + Testing Library(jsdom).

**Spec:** `docs/superpowers/specs/2026-06-03-pending-approval-footer-channel-home-design.md`

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `components/pending-approval/email-verify-screen.tsx` | 미인증 유저 화면 | 오버레이 제거 + 홈 링크 |
| `components/pending-approval/approval-waiting-screen.tsx` | 심사 대기 화면(콘페티) | 오버레이 제거(투명 콘페티) + 홈 링크 |
| `components/pending-approval/__tests__/EmailVerifyScreen.test.tsx` | 위 테스트 | next/link mock + 홈 링크 테스트 |
| `components/pending-approval/approval-waiting-screen.test.tsx` | 위 테스트 | next/link mock + 홈 링크 테스트 |

**손대지 않음**: `app/(public)/layout.tsx`, `components/shell/Footer.tsx`, `components/shell/ChannelTalk.tsx`, `app/layout.tsx` — 이미 올바름.

**테스트 실행(중요)**: 홈브루 node가 v26이라 jsdom localStorage가 깨진다. 컴포넌트 테스트는 반드시 node 20으로:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test <path>
```

---

## Task 1: EmailVerifyScreen — 오버레이 제거 + 홈 링크

**Files:**
- Test: `components/pending-approval/__tests__/EmailVerifyScreen.test.tsx`
- Modify: `components/pending-approval/email-verify-screen.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`components/pending-approval/__tests__/EmailVerifyScreen.test.tsx` 상단의 기존 `vi.mock(...)` 블록들 **아래**(그리고 `import { EmailVerifyScreen } ...` **위**)에 next/link mock을 추가한다:

```tsx
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
```

그리고 `describe('EmailVerifyScreen', ...)` 블록 안, 마지막 `it(...)` 뒤에 새 테스트를 추가한다:

```tsx
  it('홈으로 가기 링크가 루트로 연결된다', () => {
    render(<EmailVerifyScreen email="me@x.com" />);
    const link = screen.getByRole('link', { name: '홈으로 가기' });
    expect(link).toHaveAttribute('href', '/');
  });
```

- [ ] **Step 2: 테스트 실행 — 빨갛게 떨어지는지 확인**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/pending-approval/__tests__/EmailVerifyScreen.test.tsx
```
Expected: FAIL — `Unable to find an accessible element with the role "link" and name "홈으로 가기"` (아직 링크가 없음). 기존 3개 테스트는 PASS.

- [ ] **Step 3: 구현 — 오버레이 제거 + 홈 링크 추가**

`components/pending-approval/email-verify-screen.tsx` 전체를 아래로 교체한다:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmailVerifySection } from './email-verify-section';

/**
 * 가입 후 이메일 인증 전용 화면 — /pending-approval 이 *미인증* 유저에게 보여준다.
 * 인증이 끝나면 router.refresh() 로 서버 컴포넌트를 다시 그려 기존
 * pending-approval(축하·심사 대기) 화면으로 전환한다.
 *
 * public 레이아웃(app/(public)/layout.tsx) 안의 일반 흐름 콘텐츠로 렌더링한다.
 * (풀스크린 오버레이를 쓰면 레이아웃의 푸터와 채널톡 FAB을 가린다.)
 */
export function EmailVerifyScreen({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <h1 className="text-title-large">이메일을 인증해 주세요</h1>
      <p className="text-body-medium text-on-surface-variant">
        가입을 마치려면 이메일 인증이 필요해요.
        <br />
        인증하면 입점 심사가 시작됩니다.
      </p>
      <EmailVerifySection
        email={email}
        initialVerified={false}
        onVerified={() => router.refresh()}
      />
      <Link
        href="/"
        className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
      >
        홈으로 가기
      </Link>
    </div>
  );
}
```

핵심 변경: 루트 래퍼에서 `fixed inset-0 z-50 ... bg-[var(--md-sys-color-surface)] px-4` 제거 → `flex w-full flex-col items-center gap-4 text-center`. 배경·정렬·max-width는 public 레이아웃이 제공한다.

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/pending-approval/__tests__/EmailVerifyScreen.test.tsx
```
Expected: PASS (4개 모두 그린).

- [ ] **Step 5: 커밋**

```bash
git add components/pending-approval/email-verify-screen.tsx components/pending-approval/__tests__/EmailVerifyScreen.test.tsx
git commit -m "fix(pending-approval): EmailVerifyScreen 오버레이 제거 + 홈으로 가기 링크

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- components/pending-approval/email-verify-screen.tsx components/pending-approval/__tests__/EmailVerifyScreen.test.tsx
```

---

## Task 2: ApprovalWaitingScreen — 오버레이 제거(투명 콘페티) + 홈 링크

**Files:**
- Test: `components/pending-approval/approval-waiting-screen.test.tsx`
- Modify: `components/pending-approval/approval-waiting-screen.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`components/pending-approval/approval-waiting-screen.test.tsx` 상단의 기존 `vi.mock('motion/react', ...)` 블록 **아래**(그리고 `import { ApprovalWaitingScreen } ...` 와 함께 있는 import 영역 근처, mock들 뒤)에 next/link mock을 추가한다. 구체적으로 `vi.mock('motion/react', ...)` 닫는 `}));` 바로 다음 줄에:

```tsx
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
```

그리고 `describe('ApprovalWaitingScreen', ...)` 안 마지막 `it(...)` 뒤에 새 테스트를 추가한다:

```tsx
  it('홈으로 가기 링크가 루트로 연결된다', () => {
    render(<ApprovalWaitingScreen />);
    const link = screen.getByRole('link', { name: '홈으로 가기' });
    expect(link).toHaveAttribute('href', '/');
  });
```

- [ ] **Step 2: 테스트 실행 — 빨갛게 떨어지는지 확인**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/pending-approval/approval-waiting-screen.test.tsx
```
Expected: FAIL — `Unable to find an accessible element with the role "link" and name "홈으로 가기"`. 기존 7개 테스트는 PASS.

- [ ] **Step 3: 구현 — 오버레이 제거 + 투명 콘페티 + 홈 링크**

`components/pending-approval/approval-waiting-screen.tsx` 전체를 아래로 교체한다 (콘페티/애니메이션 로직은 그대로, `return` JSX와 `Link` import만 변경):

```tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion, useAnimation } from 'motion/react';
import { Chip } from '@/components/primitives/Chip';

const ICON_SPAN_STYLE = { display: 'inline-flex' } as const;

export function ApprovalWaitingScreen() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<ReturnType<typeof confetti.create> | null>(null);
  const iconControls = useAnimation();

  const fire = useCallback(() => {
    const run = fireRef.current;
    if (!run) return;
    const primary =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-primary')
        .trim() || '#0061A4';

    const shared = { colors: [primary], scalar: 1, ticks: 250 };

    // 좌측 끝에서 안쪽 위로
    run({ ...shared, particleCount: 80, angle: 60, spread: 60, startVelocity: 65, origin: { x: 0, y: 0.65 } });
    // 우측 끝에서 안쪽 위로
    run({ ...shared, particleCount: 80, angle: 120, spread: 60, startVelocity: 65, origin: { x: 1, y: 0.65 } });
    // 중앙 상단에서 180° 전방위 비
    run({ ...shared, particleCount: 120, spread: 180, startVelocity: 40, gravity: 0.6, origin: { x: 0.5, y: 0 } });

    // 아이콘 셰이크 (모션 감소 설정 존중)
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      iconControls.start({
        rotate: [-14, 12, -9, 7, -4, 2, 0],
        scale: [1, 1.3, 1.22, 1.15, 1.1, 1.04, 1],
        transition: { duration: 0.65, ease: 'easeOut' },
      });
    }
  }, [iconControls]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fireRef.current = confetti.create(canvas, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    });
    fire();
    return () => {
      fireRef.current?.reset();
      fireRef.current = null;
    };
  }, [fire]);

  return (
    <>
      {/* 콘페티 캔버스: 뷰포트 전체를 덮되 pointer-events-none 로 클릭은 통과시켜
          푸터·채널톡 FAB·홈 버튼이 그대로 동작한다. 투명 — 솔리드 배경 없음. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      {/* 콘텐츠: public 레이아웃 안의 일반 흐름. 콘페티 위(z-10). */}
      <div className="relative z-10 flex w-full flex-col items-center gap-4 text-center">
        <button
          type="button"
          aria-label="축하 효과 다시 보기"
          onClick={fire}
          className="rounded-[var(--md-sys-shape-small)] p-2 text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
        >
          <motion.span animate={iconControls} style={ICON_SPAN_STYLE}>
            <PartyPopper className="size-9" strokeWidth={1.5} />
          </motion.span>
        </button>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-title-large">거의 다 왔어요!</h1>
          <p className="text-body-medium text-on-surface-variant">
            가입을 완료했어요.
            <br />
            지금 입점 심사를 진행하고 있어요.
          </p>
        </div>

        <Chip color="tertiary" label="✓ 심사는 영업일 기준 2일 이내로 완료해요" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-body-small text-on-surface-variant">
            승인되면 이메일로 안내드립니다.
          </p>
          <p className="text-body-small text-on-surface-variant">
            궁금한 점은 우측 하단 채널톡으로 문의해요.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
        >
          홈으로 가기
        </Link>
      </div>
    </>
  );
}
```

핵심 변경:
- 루트 `<div className="fixed inset-0 z-50 bg-...">` 제거 → `<>` 프래그먼트.
- canvas: `absolute inset-0` → `fixed inset-0 z-0` (투명, 뷰포트 전체, 콘텐츠 뒤).
- 콘텐츠 래퍼: `absolute inset-0 z-10 flex ... justify-center` + 내부 `max-w-md` → `relative z-10 flex w-full flex-col items-center gap-4 text-center` (일반 흐름).
- 맨 아래 홈 링크 추가.

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/pending-approval/approval-waiting-screen.test.tsx
```
Expected: PASS (8개 모두 그린 — 기존 7 + 홈 링크 1).

- [ ] **Step 5: 커밋**

```bash
git add components/pending-approval/approval-waiting-screen.tsx components/pending-approval/approval-waiting-screen.test.tsx
git commit -m "fix(pending-approval): ApprovalWaitingScreen 오버레이 제거 + 홈으로 가기 링크

콘페티는 pointer-events-none 투명 캔버스로 유지해 푸터·채널톡 FAB 클릭을 통과시킴.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- components/pending-approval/approval-waiting-screen.tsx components/pending-approval/approval-waiting-screen.test.tsx
```

---

## Task 3: 헬스 체크 + 수동 브라우저 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 타입체크**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach|afterEach)'" | grep -E "error TS" || echo "TYPECHECK CLEAN (test-globals 노이즈 제외)"
```
Expected: `TYPECHECK CLEAN ...` — 우리가 만진 두 컴포넌트·테스트에 새 에러 없음. (clean HEAD에 이미 있는 vitest-globals 노이즈는 우리 변경과 무관 — 메모 `typecheck red: wizard test globals` 참조.)

- [ ] **Step 2: 린트**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm lint
```
Expected: 우리가 만진 파일에 새 경고/에러 없음.

- [ ] **Step 3: 대상 테스트 전체 그린 재확인**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/pending-approval
```
Expected: pending-approval 디렉터리 전체 PASS.

- [ ] **Step 4: 수동 브라우저 검증 (오버레이 제거 = 시각/3rd-party라 단위 테스트 불가)**

`pnpm dev`로 띄우고 `/pending-approval` 진입(심사 대기 상태 계정). 확인:
- [ ] 하단 **푸터**가 보인다 (SUPPORTER B CORP. / 약관 링크 등).
- [ ] 우측 하단 **채널톡 FAB**이 보인다.
- [ ] **홈으로 가기** 버튼이 보이고, 클릭 시 `/`(랜딩)로 이동한다.
- [ ] 진입 시 **콘페티**가 발사되고, 그 와중에도 푸터/FAB/홈 버튼이 **클릭 가능**하다.
- [ ] (가능하면) 미인증 상태 계정으로 `/pending-approval` 진입 시에도 푸터·FAB·홈 버튼이 보인다.

문제 없으면 완료. 추가 시각 폴리시가 필요하면 `/design-review`.

---

## Self-Review (작성자 체크 완료)

- **Spec coverage**: 푸터 노출(=오버레이 제거 Task1·2) ✓, 채널톡 노출(=오버레이 제거로 자동 ✓) ✓, 홈 버튼(Task1·2) ✓, 두 화면 모두 적용 ✓, TDD(홈 링크 RED→GREEN) ✓.
- **Placeholder scan**: 모든 코드 블록은 완전한 최종 내용. TBD/TODO 없음.
- **Type/이름 일관성**: 링크 라벨 "홈으로 가기"·`href="/"`가 테스트 단언과 구현에서 동일. next/link mock 시그니처는 리포 관례(`components/home/__tests__/ActionQueue.test.tsx`)와 동일.
