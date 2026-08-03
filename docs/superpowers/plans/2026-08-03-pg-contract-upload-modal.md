# PG 계약서 올리기 전체화면 모달 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG 가 계약서를 올리는 스노우싸인 임베드를 딜룸 카드 안 인라인 패널에서 딜룸 위에 겹치는 거의 전체화면 모달로 옮긴다.

**Architecture:** `SigningSendModal` 을 신설해 Dialog 껍데기·헤더·이탈 확인을 맡기고, 기존 `SigningSendEmbed` 는 iframe 과 postMessage 신뢰 경계만 남기도록 축소한다. `SigningTab` 이 소유한 리스·하트비트·이어받기·서버 액션은 일절 손대지 않는다 — 이 작업은 표현 계층 전환이다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · `@base-ui/react@1.4.1` Dialog · Tailwind v4 (CSS 변수 토큰) · Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-08-03-pg-contract-upload-modal-design.md`

## Global Constraints

- **TDD 필수** — 실패하는 테스트를 먼저 쓰고 `pnpm test <path>` 로 RED 를 눈으로 확인한 뒤 구현한다. 즉시 통과한 테스트는 가짜 테스트다.
- **워크트리에서 작업한다** — `/Users/yeonseong/project/bidit/.claude/worktrees/feat-signing-send-modal`, 브랜치 `worktree-feat-signing-send-modal`. `cd` 로 메인 레포에 가지 않는다.
- **테스트 실행은 `pnpm test <path>`** — 단일 파일로 빠르게. 전체는 마지막에 한 번.
- **Linear 디자인 하드룰**: 인터랙티브 요소 라운드 6px (`shape-small`), pill 금지, 큰 그림자 금지 — 단 floating 요소(dialog)는 `shadow-[var(--md-sys-elevation-4)]` 허용, 구분선은 `outline-variant`, 본문 14px 이하(앱 본문 13px 대), 액센트 그라디언트/네온/글래스모피즘 금지, 이메일 등 숫자·식별자는 `.md-numeric`.
- **UX 라이팅**: 해요체·능동형·긍정형. 버튼은 동사로 끝낸다.
- **`on-surface-variant` 를 보조 텍스트 색으로 쓴다** — `outline` 토큰은 border 전용이라 텍스트에 쓰면 드리프트 가드 테스트가 잡는다.
- **커밋 메시지 말미**에 다음 두 줄을 붙인다:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Bkyg9u19YfKjQkBP6mJ1Zx
  ```
- **pre-commit 훅은 staged-only** (변경된 파일만 eslint + `.ts/.tsx` 있으면 tsc). `--no-verify` 를 쓰지 않는다.

## File Structure

| 파일 | 책임 |
|---|---|
| `components/deal-room/signing/SigningSendModal.tsx` **(신설)** | Dialog 껍데기 · 헤더(제목·수신자) · 이탈 확인 다이얼로그. 표현과 이탈만. |
| `components/deal-room/signing/SigningSendEmbed.tsx` **(축소)** | iframe · 오리진 대조 · postMessage 게이트 · 로드 phase. 신뢰 경계만. |
| `components/deal-room/signing/SigningTab.tsx` **(1줄 블록 교체)** | 리스·하트비트·이어받기·서버 액션 — **로직 무변경**. 렌더 대상만 모달로. |
| `components/deal-room/signing/__tests__/SigningSendModal.test.tsx` **(신설)** | 이탈 3경로 · 중첩 Esc 전파 차단 · iframe 리마운트 없음 · 수신자 표시 |
| `components/deal-room/signing/__tests__/SigningSendEmbed.test.tsx` **(축소)** | 13개 → 11개. 헤더·닫기 테스트 2개는 모달 테스트로 이사 |
| `components/deal-room/signing/__tests__/SigningTab.test.tsx` **(2곳 수정)** | `닫기` 를 누르는 테스트가 확인 다이얼로그를 한 번 더 통과해야 한다 |
| `SCREEN_DESIGN.md` **(1줄 수정)** | P3 행의 "카드 안에 열린다" → 모달. 컴포넌트 목록에 `SigningSendModal` 추가 |

### 왜 Task 1 이 한 덩어리인가

헤더·`닫기` 버튼·수신자 블록이 `SigningSendEmbed` 에서 `SigningSendModal` 로 **이사**한다. 반쪽만 하면 두 컴포넌트가 같은 이름(`닫기`)의 버튼을 동시에 렌더해 `getByRole` 이 ambiguity 로 던지고, 트리가 빨간 채로 커밋된다. 세 파일 변경이 하나의 원자적 리팩터라 한 태스크·한 커밋으로 간다.

---

### Task 1: 발송 임베드를 전체화면 모달로

**Files:**
- Create: `components/deal-room/signing/SigningSendModal.tsx`
- Create: `components/deal-room/signing/__tests__/SigningSendModal.test.tsx`
- Modify: `components/deal-room/signing/SigningSendEmbed.tsx` (전면 재작성 — 축소)
- Modify: `components/deal-room/signing/__tests__/SigningSendEmbed.test.tsx` (2개 삭제, `onClose` prop 제거)
- Modify: `components/deal-room/signing/SigningTab.tsx:46` (import), `:430-443` (렌더 블록)
- Modify: `components/deal-room/signing/__tests__/SigningTab.test.tsx:530`, `:556`

**Interfaces:**
- Consumes: `SigningSendEmbed` 의 기존 계약 — `onComplete: (id: string) => Promise<boolean>` (false 면 완료 가드 해제), `onReload?: () => void`
- Produces:
  ```ts
  function SigningSendModal(props: {
    iframeUrl: string;
    buyerSigner?: { name: string; email: string } | null;
    onComplete: (providerContractId: string) => Promise<boolean>;
    onReload?: () => void;
    onClose: () => void;
  }): JSX.Element

  function SigningSendEmbed(props: {
    iframeUrl: string;
    onComplete: (providerContractId: string) => Promise<boolean>;
    onReload?: () => void;
  }): JSX.Element
  ```
  `SigningSendModal` 에는 `open` prop 이 **없다**. `SigningTab` 이 `{embed && <SigningSendModal …/>}` 로 마운트를 통제하고, Dialog Root 는 `open` 리터럴을 받는다 — `DealRoomModal.tsx:57` 과 같은 방식이다.

---

- [ ] **Step 1: 중첩 Esc 전파를 재현하는 실패 테스트를 쓴다**

이 스텝이 계획 전체에서 가장 먼저 오는 이유: Esc 가 최상단에서 멈추지 않고 바깥 Dialog 까지 전파되면 실제 화면에서는 `DealRoomModal.tsx:58` 의 `router.back()` 이 돌아 **딜룸이 통째로 닫히고 작성 중인 계약서가 날아간다**. 설계의 전제가 여기서 참/거짓으로 갈린다.

`components/deal-room/signing/__tests__/SigningSendModal.test.tsx` 를 새로 만든다:

```tsx
import type { ComponentProps } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { SigningSendModal } from '../SigningSendModal';

const IFRAME_SRC = 'https://app.snowsign.example/embed/abc';
const FRAME_TITLE = '스노우싸인 계약서 발송';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal(overrides: Partial<ComponentProps<typeof SigningSendModal>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <SigningSendModal
      iframeUrl={IFRAME_SRC}
      onComplete={vi.fn(async () => true)}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose, view };
}

describe('SigningSendModal', () => {
  // 딜룸 모달은 Escape 를 router.back() 으로 매핑한다(DealRoomModal.tsx:58). 이 모달의
  // Escape 가 거기까지 새면 딜룸이 통째로 닫히고 작성 중인 계약서가 날아간다.
  it('Escape 가 바깥 Dialog 까지 전파되지 않는다', async () => {
    const outerOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DialogPrimitive.Root open onOpenChange={outerOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Popup>
            <SigningSendModal
              iframeUrl={IFRAME_SRC}
              onComplete={vi.fn(async () => true)}
              onClose={vi.fn()}
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>,
    );

    await user.keyboard('{Escape}');

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(outerOpenChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningSendModal.test.tsx`
Expected: FAIL — `Failed to resolve import "../SigningSendModal"`

- [ ] **Step 3: 나머지 모달 테스트 7개를 추가한다**

위 `describe` 블록 안에, Step 1 테스트 **뒤에** 이어 붙인다:

```tsx
  it('닫기 버튼은 바로 닫지 않고 확인을 받는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // 확인을 받는 동안에도 모달은 열려 있어야 한다 — 여기서 닫히면 작성물이 날아간다.
    expect(screen.getByTitle(FRAME_TITLE)).toBeInTheDocument();
  });

  it('백드롭 클릭도 바로 닫지 않고 확인을 받는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByTestId('signing-send-backdrop'));

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTitle(FRAME_TITLE)).toBeInTheDocument();
  });

  it('Escape 도 바로 닫지 않고 확인을 받는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // 확인을 받는 의미가 여기 있다 — 되돌리면 작성물이 그대로 남아야 한다. iframe 이
  // 리마운트되면 스노우싸인 세션이 처음으로 돌아가 확인을 받은 보람이 없다.
  it('계속 작성하기를 고르면 iframe 이 리마운트되지 않는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    const before = screen.getByTitle(FRAME_TITLE);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(await screen.findByRole('button', { name: '계속 작성하기' }));

    await waitFor(() =>
      expect(screen.queryByText('계약서 작성을 그만둘까요?')).not.toBeInTheDocument(),
    );
    expect(screen.getByTitle(FRAME_TITLE)).toBe(before);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('그만두기를 고르면 onClose 를 한 번 부른다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(await screen.findByRole('button', { name: '그만두기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 리스 반납은 SigningTab 의 언마운트 effect 가 소유한다. 모달이 언마운트에서 또
  // onClose 를 부르면 죽은 토큰으로 반납이 두 번 나간다.
  it('언마운트만으로는 onClose 를 부르지 않는다', () => {
    const { onClose, view } = renderModal();
    view.unmount();
    expect(onClose).not.toHaveBeenCalled();
  });

  // 임베드는 참여자 프리필을 지원하지 않아 PG 가 수신자를 직접 타이핑한다. 오타 하나로
  // 엉뚱한 사람에게 계약이 나가므로 정확한 값이 눈앞에 있어야 한다.
  it('구매사 서명 담당자를 헤더에 보여준다', () => {
    renderModal({ buyerSigner: { name: '김구매', email: 'buyer@corp.com' } });
    expect(screen.getByText('buyer@corp.com')).toBeInTheDocument();
    expect(screen.getByText(/김구매/)).toBeInTheDocument();
  });
```

- [ ] **Step 4: 테스트를 돌려 8개 모두 실패하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningSendModal.test.tsx`
Expected: FAIL — 여전히 import 해결 실패 (8 tests failed)

- [ ] **Step 5: `SigningSendModal` 을 구현한다**

`components/deal-room/signing/SigningSendModal.tsx` 를 새로 만든다:

```tsx
'use client';

/**
 * SigningSendModal — 계약서 보내기 전체화면 모달.
 *
 * PG 가 스노우싸인 임베드에서 자사 계약서 PDF 를 올리고 서명칸을 배치해 발송하는
 * 작업은 되돌리기 어렵고(발송 = 양측에 서명 요청 메일) 화면 면적을 많이 먹는다.
 * 딜룸 카드 안 인라인 패널 대신 딜룸 위를 덮는 모달로 띄워 면적과 집중을 함께 준다.
 *
 * **이탈은 반드시 확인을 거친다.** 작업물(PDF·서명칸 좌표)은 스노우싸인 안에만 있고
 * 우리는 사본이 없다 — iframe 이 언마운트되면 그대로 사라진다. 모달은 백드롭 클릭과
 * Escape 라는 실수하기 쉬운 이탈 경로를 기본으로 달고 오므로, 세 경로(백드롭·Escape·
 * 닫기)를 모두 확인 다이얼로그로 수렴시킨다. Dialog 는 controlled 이므로 여기서
 * `open` 을 내리지 않는 한 닫히지 않는다.
 *
 * 확인은 **무조건** 뜬다. iframe 은 서드파티 오리진이라 진행 상태를 읽을 수 없어
 * "아직 아무것도 안 했으니 그냥 닫아도 된다"를 판별할 방법이 없다.
 *
 * 리스·하트비트·이어받기·서버 액션은 SigningTab 이 소유한다 — 이 컴포넌트는 표현과
 * 이탈만 책임진다. 언마운트에서 onClose 를 부르지 않는 것도 그래서다(반납은 저쪽 일).
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SigningSendEmbed } from './SigningSendEmbed';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function SigningSendModal({
  iframeUrl,
  buyerSigner,
  onComplete,
  onReload,
  onClose,
}: {
  iframeUrl: string;
  /** 구매사 서명 담당자 — PG 가 임베드 안에서 수신자로 직접 입력해야 한다. */
  buyerSigner?: { name: string; email: string } | null;
  /** 임베드가 알린 provider 계약 id. 진짜 게이트는 서버의 attachProviderContract 다. */
  onComplete: (providerContractId: string) => Promise<boolean>;
  /** 로드에 실패했을 때 세션을 새로 발급받아 다시 열기. */
  onReload?: () => void;
  /** 확인을 통과했을 때만 불린다 — 부모가 리스를 반납하고 모달을 언마운트한다. */
  onClose: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <DialogPrimitive.Root
      open
      // 백드롭(outside-press)과 Escape(escape-key)가 여기로 온다. 어느 쪽이든 `open` 을
      // 내리지 않고 확인창만 띄운다 — controlled 라 이것만으로 닫히지 않는다.
      // (닫기 버튼은 아래에서 직접 setConfirmOpen 을 부른다.)
      onOpenChange={(next) => {
        if (!next) setConfirmOpen(true);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-testid="signing-send-backdrop"
          className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 dark:bg-white/10"
        />
        <DialogPrimitive.Popup
          data-testid="signing-send-modal"
          className="fixed top-1/2 left-1/2 z-50 flex h-[calc(100dvh-2rem)] w-[min(1400px,100dvw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--md-sys-shape-extra-large)] bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-4)] ring-1 ring-[var(--md-sys-color-outline-variant)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5">
            <DialogPrimitive.Title className="shrink-0 text-[13.5px] font-semibold">
              계약서 보내기
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className={'min-w-0 flex-1 truncate text-[12.5px] ' + dim}>
              {buyerSigner ? (
                <>
                  수신자{' '}
                  <span className="font-medium text-[var(--md-sys-color-on-surface)]">
                    {buyerSigner.name}
                  </span>{' '}
                  <span className="md-numeric">{buyerSigner.email}</span>
                </>
              ) : (
                '계약서를 올리고 서명칸을 배치하면 바로 발송돼요'
              )}
            </DialogPrimitive.Description>
            {/* base-ui 의 Dialog.Close 를 쓰지 않는다 — primitives/Button 은 children 이
                필수라 `render={<Button />}`(children 없는 엘리먼트)이 tsc 에서 깨진다.
                평범한 onClick 으로 같은 곳(확인창)에 도착한다. */}
            <Button variant="text" size="sm" onClick={() => setConfirmOpen(true)}>
              <X className="size-[15px]" aria-hidden />
              닫기
            </Button>
          </header>

          {/* min-h-0 이 없으면 flex 자식이 콘텐츠 높이로 부풀어 헤더를 밀어낸다. */}
          <div className="min-h-0 flex-1">
            <SigningSendEmbed iframeUrl={iframeUrl} onComplete={onComplete} onReload={onReload} />
          </div>

          {/* Popup 안에 두어야 base-ui 가 중첩 관계를 인식하고, 확인창이 열려도 위
              임베드가 언마운트되지 않는다(형제 노드). SigningTab 의 취소·이어받기
              확인창이 딜룸 모달 안에 놓이는 것과 같은 배치다. */}
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="계약서 작성을 그만둘까요?"
            description="작성 중인 계약서와 배치한 서명칸은 저장되지 않아요. 다시 열면 처음부터 올려야 해요."
            confirmLabel="그만두기"
            cancelLabel="계속 작성하기"
            variant="danger"
            onConfirm={() => {
              setConfirmOpen(false);
              onClose();
            }}
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

- [ ] **Step 6: `SigningSendEmbed` 를 축소한다**

`components/deal-room/signing/SigningSendEmbed.tsx` 에서:

1. `import { X } from 'lucide-react';` 를 **삭제**한다 (`Button` 은 `다시 열기` 에 계속 쓰이므로 남긴다).
2. props 에서 `buyerSigner` 와 `onClose` 를 **삭제**한다. 남는 것은 `iframeUrl` · `onComplete` · `onReload`.
3. 파일 상단 주석의 마지막 문단을 다음으로 바꾼다:

```
 * 이 프레임은 모달 콘텐츠 영역의 대부분을 그리는 서드파티 오리진이므로 sandbox 로 가둔다.
 * 껍데기(제목·수신자 안내·닫기)는 SigningSendModal 이 소유한다 — 여기 남은 것은 전부
 * 신뢰 경계다.
```

4. `return` 문 전체를 다음으로 바꾼다 — 바깥 `border-t` 래퍼, 제목·설명 헤더, `닫기` 버튼, `buyerSigner` 블록이 전부 사라지고 높이는 부모가 정한다:

```tsx
  return (
    // 서드파티 화면이라 로드까지 시간이 걸리고, 세션 만료·차단이면 영영 안 뜬다.
    // 아무 표시가 없으면 빈 영역이 '앱이 멈췄다'와 구분되지 않는다.
    <div className="relative h-full">
      {phase === 'loading' && (
        <div
          role="status"
          aria-label="계약서 화면을 불러오는 중"
          className="absolute inset-0 grid place-items-center bg-[var(--md-sys-color-surface-container-lowest)]"
        >
          <div className="w-full max-w-[420px] space-y-2.5 px-6">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-[220px] w-full rounded-md" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      )}
      {phase === 'failed' && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--md-sys-color-surface-container-lowest)] px-6">
          <div className="text-center">
            <p className="text-[13px] font-medium">계약서 화면을 불러오지 못했어요</p>
            <p className={'mt-1 text-[12.5px] ' + dim}>
              네트워크를 확인하고 다시 열어보세요. 계속 안 되면 문의해 주세요.
            </p>
            {onReload && (
              <Button variant="outlined" size="sm" className="mt-3" onClick={onReload}>
                다시 열기
              </Button>
            )}
          </div>
        </div>
      )}
      <iframe
        title="스노우싸인 계약서 발송"
        src={iframeUrl}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        allow="camera; clipboard-write"
        onLoad={() => setPhase('ready')}
        onError={() => setPhase('failed')}
        className="h-full w-full border-0"
      />
    </div>
  );
```

`trustedOrigin` · `doneRef` · `onCompleteRef` · `phase` · `EMBED_LOAD_TIMEOUT_MS` · `SANDBOX` · 두 `useEffect` 는 **한 줄도 바꾸지 않는다**. 전부 신뢰 경계다.

- [ ] **Step 7: `SigningSendEmbed` 테스트에서 이사 간 2개를 지우고 `onClose` prop 을 뗀다**

`components/deal-room/signing/__tests__/SigningSendEmbed.test.tsx`:

1. `it('shows the buyer signer so the PG types the right recipient', …)` (37–48행) 블록을 통째로 삭제한다 — 모달 테스트의 `구매사 서명 담당자를 헤더에 보여준다` 가 대신한다.
2. `it('closes on the close button', …)` (156–162행) 블록을 통째로 삭제한다 — 모달 테스트의 `닫기 버튼은 바로 닫지 않고 확인을 받는다` 가 대신한다.
3. 남은 11개 테스트의 모든 `render(<SigningSendEmbed … />)` 에서 `onClose={vi.fn()}` 를 지운다.
4. 2번을 지우면 `userEvent` 는 `offers a retry when the embed never loads` 에서 계속 쓰이므로 import 를 **남긴다**. `fireEvent` · `waitFor` 도 그대로다.

- [ ] **Step 8: 두 테스트 파일을 돌려 GREEN 을 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningSendModal.test.tsx components/deal-room/signing/__tests__/SigningSendEmbed.test.tsx`
Expected: PASS — 모달 8개 + 임베드 11개 = 19 passed

**Escape 가 바깥 Dialog 까지 전파되지 않는다 가 실패하면** — base-ui 가 중첩 Dialog 의 Escape 를 최상단에서 멈추지 않는다는 뜻이다. 그때만 `DialogPrimitive.Popup` 에 다음을 더한다(그 전에는 더하지 않는다 — 필요 없는 핸들러는 YAGNI 이고, base-ui 의 자체 처리와 이중으로 돌면 확인창이 두 번 열린다):

```tsx
          onKeyDown={(e) => {
            // 딜룸 모달의 Escape 는 router.back() 이다 — 여기서 멈추지 않으면 딜룸이
            // 통째로 닫히고 작성 중인 계약서가 사라진다.
            if (e.key === 'Escape') e.stopPropagation();
          }}
```

- [ ] **Step 9: `SigningTab` 을 모달로 배선한다**

`components/deal-room/signing/SigningTab.tsx`:

1. 46행 `import { SigningSendEmbed } from './SigningSendEmbed';` 를 다음으로 바꾼다:

```tsx
import { SigningSendModal } from './SigningSendModal';
```

2. 430–443행의 렌더 블록을 다음으로 바꾼다:

```tsx
      {embed && (
        <SigningSendModal
          key={embed.url}
          iframeUrl={embed.url}
          buyerSigner={buyerSigner}
          onComplete={onEmbedComplete}
          onClose={closeEmbed}
          // 로드 실패는 세션이 죽었을 수 있다 — 리스를 반납하고 새로 발급받는다.
          onReload={() => {
            closeEmbed();
            void openEmbed();
          }}
        />
      )}
```

이 파일에서 **다른 곳은 건드리지 않는다.** 리스 하트비트(`renewNow`)·이어받기 구독·언마운트 반납·`releaseClaim`·`closeEmbed` 는 그대로다.

- [ ] **Step 10: `SigningTab` 테스트를 돌려 어디가 깨지는지 본다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningTab.test.tsx`
Expected: FAIL 2건 — `닫기` 를 누르는 두 테스트(516행·542행 주석 아래)가 확인 다이얼로그에 막혀 `releaseMock` 이 안 불린다

- [ ] **Step 11: `닫기` 를 누르는 두 테스트에 확인 단계를 더한다**

`components/deal-room/signing/__tests__/SigningTab.test.tsx` 의 530행과 556행, 두 곳 모두 다음 한 줄을 `닫기` 클릭 **바로 뒤**에 끼운다:

```tsx
    await user.click(await screen.findByRole('button', { name: '그만두기' }));
```

두 테스트의 주석(`닫기가 리스를 반납하지 않으면…`)은 그대로 둔다 — 주장하는 바가 바뀌지 않았다. 이탈에 확인이 한 겹 붙었을 뿐 반납 계약은 동일하다.

- [ ] **Step 12: `SigningTab` 테스트가 GREEN 인지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningTab.test.tsx`
Expected: PASS

- [ ] **Step 13: 타입체크와 린트를 돌린다**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 둘 다 exit 0

`.next` 타입젠이 stale 해서 tsc 가 없는 라우트를 참조하며 깨지면 `rm -rf .next && pnpm next typegen` 후 다시 돌린다.

- [ ] **Step 14: 커밋한다**

```bash
git add components/deal-room/signing/SigningSendModal.tsx \
        components/deal-room/signing/SigningSendEmbed.tsx \
        components/deal-room/signing/SigningTab.tsx \
        components/deal-room/signing/__tests__/SigningSendModal.test.tsx \
        components/deal-room/signing/__tests__/SigningSendEmbed.test.tsx \
        components/deal-room/signing/__tests__/SigningTab.test.tsx
git commit -m "$(cat <<'EOF'
feat: 계약서 올리기를 딜룸 위 전체화면 모달로

임베드가 딜룸 모달(최대 900px) 안 72dvh iframe 이라 PDF 를 올리고 서명칸을
배치하기에 좁았고, 타임라인·액션바·채팅이 같이 보여 산만했다.

SigningSendModal 을 신설해 Dialog 껍데기·헤더·이탈 확인을 맡기고,
SigningSendEmbed 는 iframe 과 postMessage 신뢰 경계만 남겼다. SigningTab 의
리스·하트비트·이어받기·서버 액션은 무변경.

이탈 3경로(백드롭·Escape·닫기)를 확인 다이얼로그 하나로 수렴시킨다 —
작업물이 스노우싸인 안에만 있어 언마운트가 곧 소실이다. 확인 중에도 iframe 은
리마운트되지 않는다(그러면 확인을 받은 보람이 없다).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bkyg9u19YfKjQkBP6mJ1Zx
EOF
)"
```

---

### Task 2: 화면 문서 갱신과 전체 검증

**Files:**
- Modify: `SCREEN_DESIGN.md:103`
- Test: 전체 스위트

**Interfaces:**
- Consumes: Task 1 의 `SigningSendModal`
- Produces: 없음 (문서·검증)

- [ ] **Step 1: `SCREEN_DESIGN.md` 의 P3 행을 고친다**

103행 안에서 다음 문자열을 찾아 바꾼다:

찾기:
```
(누르면 스노우싸인 임베드 패널이 카드 안에 열린다)
```

바꾸기:
```
(누르면 스노우싸인 임베드가 딜룸 위를 덮는 거의 전체화면 모달 `SigningSendModal` 로 열린다 — 백드롭·Escape·닫기 세 경로 모두 '계약서 작성을 그만둘까요?' 확인을 거친다. 작업물이 스노우싸인 안에만 있어 언마운트가 곧 소실이기 때문이고, iframe 진행 상태를 읽을 수 없어 확인은 무조건 뜬다)
```

같은 행 맨 끝 컴포넌트 목록에서 찾기:
```
`SigningTab`, `SigningSendEmbed`, `SigningRecoveryDialog`
```

바꾸기:
```
`SigningTab`, `SigningSendModal`, `SigningSendEmbed`, `SigningRecoveryDialog`
```

- [ ] **Step 2: B4(구매사 딜룸) 행에도 같은 서술이 있는지 확인한다**

Run: `grep -n "임베드 패널이 카드 안에" SCREEN_DESIGN.md`
Expected: 출력 없음 (Step 1 에서 유일한 출현을 바꿨다)

출력이 남으면 그 행에도 Step 1 과 같은 치환을 적용한다.

- [ ] **Step 3: 전체 테스트 스위트를 돌린다**

Run: `pnpm test`
Expected: exit 0

실패가 나오면 **이 브랜치가 만든 것인지부터 가른다.** 이 레포의 `origin/dev` 에는 `localStorage` 관련 선존재 실패 이력이 있어 무작정 쫓으면 시간을 버린다.

```bash
git diff --name-only origin/dev   # 이 브랜치가 손댄 파일 전부
```

실패한 테스트 파일이 이 목록에 **없으면** 선존재 실패다 — 기록만 남기고 쫓지 않는다. 목록에 **있으면** 이 브랜치가 깨뜨린 것이므로 고친다.

- [ ] **Step 4: 커밋한다**

```bash
git add SCREEN_DESIGN.md
git commit -m "$(cat <<'EOF'
docs(screen): 계약서 올리기 임베드가 전체화면 모달임을 기록

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bkyg9u19YfKjQkBP6mJ1Zx
EOF
)"
```

---

## 수동 확인 (자동 테스트로 못 잡는 것)

자동 테스트는 회귀를 막지만 시각·조작감은 못 본다. Task 2 이후 한 번 본다:

- [ ] 딜룸을 **모달로** 열고(목록에서 카드 클릭) 계약 탭 → `계약서 올리기` → 모달이 딜룸을 덮고 iframe 이 화면 높이를 거의 다 쓰는가
- [ ] 딜룸을 **정식 페이지로** 열고(새로고침) 같은 동작 — 모달이 동일하게 뜨는가
- [ ] 딜룸 모달의 전체화면(⤢) 상태에서도 이 모달이 위에 제대로 뜨는가
- [ ] 백드롭 클릭 · Escape · `닫기` 세 경로가 모두 확인창을 띄우는가
- [ ] `계속 작성하기` 를 눌렀을 때 스노우싸인 화면이 처음으로 돌아가지 않는가 (PDF 를 하나 올려 두고 확인)
- [ ] 확인창이 떠 있는 동안 Escape 를 누르면 확인창만 닫히고 딜룸이 살아 있는가
- [ ] 라이트·다크 테마 모두에서 헤더 구분선과 수신자 텍스트가 읽히는가
