# 견적 채팅 UI 시각 폴리시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 채팅의 발신자 표기·대화목록·헤더·날짜 구분선·빈/로딩/에러 상태를 Linear 디자인에 맞춰 다듬고, "로딩=텍스트" 하드룰을 펄스 스켈레톤·점 허용으로 갱신한다(기능 불변).

**Architecture:** 공용 프리미티브 3개(`Skeleton`·`TypingDots`·`DateDivider`)와 `Avatar` `xs` 사이즈를 먼저 만들고, 소비처(`ConversationList`·`ThreadView`·`TeamThreadView`·`AttachmentGalleryPanel`·`ThreadSkeleton`)에 적용한다. 마지막에 디자인 원칙 문서를 갱신한다. 대부분 시각 변경이라 로직·조건·새 렌더 데이터가 붙는 곳만 RED→GREEN.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 + CSS 변수 토큰, Vitest + @testing-library/react (jsdom).

## Global Constraints

- **실행 위치:** dev 에서 분기한 worktree 브랜치(`feat/chat-ui-polish`)에서 진행. dev 는 clean 유지. (실행 시 `superpowers:using-git-worktrees` 로 생성.)
- **색/모양은 토큰만:** 하드코딩 hex 금지. `var(--md-sys-color-*)` / `var(--md-sys-shape-*)` 사용. 숫자(코드·시각)는 `.md-numeric`.
- **로딩 모션 허용(이번에 신설):** 넓은 영역=펄스 스켈레톤, 인라인·타이핑=펄스 점. 모두 `motion-reduce:animate-none`. 스피너는 채팅에 미사용.
- **UI 문구:** 한국어 해요체(UX_WRITING.md). 영어 식별자/라우트는 그대로.
- **TDD:** 로직·조건 분기·새 렌더 데이터는 실패 테스트 먼저. 순수 스타일(className/토큰)만 바뀌면 기존 테스트 green 유지로 가드.
- **커밋:** 모든 커밋 메시지 끝에 다음 trailer 를 붙인다 — `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (한 줄 띄우고). pre-commit 훅이 `pnpm lint` + `pnpm typecheck` 를 돌리므로 통과해야 커밋된다.
- **단일 테스트 실행:** `pnpm test <path>` (RED/GREEN 빠른 확인). 전체는 `pnpm test`.

---

### Task 1: Avatar `xs` 사이즈 추가 — ⚠️ SKIPPED (실행 시 드리프트 반영)

> **건너뜀 사유:** dev 가 PR#287(v0.2.38.0)로 전진하면서 작성자 헤더 아바타가 인터랙티브 `UserProfileCard` 트리거(클릭→프로필 팝오버)로 바뀌었다. 20px(`xs`)로 줄이면 WCAG 2.5.8(인터랙티브 요소 최소 24px 터치 타깃) 위반. 아바타는 `sm`(24px) 유지하고 "컴팩트" 인상은 날짜 칩(Task 4/7)으로 대신한다. **이 태스크의 아래 단계는 실행하지 않는다.**


**Files:**
- Modify: `components/primitives/Avatar.tsx`
- Test: `components/primitives/__tests__/Avatar.test.tsx` (기존 파일에 케이스 추가)

**Interfaces:**
- Produces: `<Avatar size="xs" />` — 20px(`w-5 h-5`) 아바타. Task 7 의 컴팩트 헤더가 소비.

- [ ] **Step 1: 실패 테스트 추가**

`components/primitives/__tests__/Avatar.test.tsx` 의 `describe` 안에 추가:

```tsx
  it('size="xs" 면 w-5 h-5 로 렌더한다', () => {
    render(<Avatar name="김영선" size="xs" />);
    const el = screen.getByLabelText('김영선');
    expect(el).toHaveClass('w-5');
    expect(el).toHaveClass('h-5');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/primitives/__tests__/Avatar.test.tsx`
Expected: FAIL — `size="xs"` 가 타입 에러이거나 `w-5` 클래스 없음.

- [ ] **Step 3: 구현 — `AvatarSize` 에 `xs` 추가**

`components/primitives/Avatar.tsx` 에서 세 곳 수정:

```tsx
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
```

```tsx
const sizeMap: Record<AvatarSize, string> = {
  xs: 'w-5 h-5 text-[length:var(--md-typescale-label-small-size)]',
  sm: 'w-6 h-6 text-[length:var(--md-typescale-label-small-size)]',
  md: 'w-8 h-8 text-[length:var(--md-typescale-label-large-size)]',
  lg: 'w-10 h-10 text-[length:var(--md-typescale-title-small-size)]',
};

const imgSizeMap: Record<AvatarSize, string> = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/primitives/__tests__/Avatar.test.tsx`
Expected: PASS (전체 케이스 green)

- [ ] **Step 5: 커밋**

```bash
git add components/primitives/Avatar.tsx components/primitives/__tests__/Avatar.test.tsx
git commit -m "feat(avatar): add xs size for compact chat headers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `Skeleton` 프리미티브

**Files:**
- Create: `components/primitives/Skeleton.tsx`
- Test: `components/primitives/__tests__/Skeleton.test.tsx`

**Interfaces:**
- Produces: `<Skeleton className="..." />` — 펄스 자리표시 블록(라운드/크기는 className 으로). Task 8·9 가 소비.

- [ ] **Step 1: 실패 테스트 작성**

Create `components/primitives/__tests__/Skeleton.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
  it('펄스 애니메이션과 전달한 className 을 가진 블록을 렌더한다', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('animate-pulse');
    expect(el).toHaveClass('h-4');
    expect(el).toHaveClass('w-20');
  });

  it('motion-reduce 에서 애니메이션을 끄는 클래스를 포함한다', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('motion-reduce:animate-none');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/primitives/__tests__/Skeleton.test.tsx`
Expected: FAIL — `Skeleton` 모듈 없음.

- [ ] **Step 3: 구현**

Create `components/primitives/Skeleton.tsx`:

```tsx
import { cn } from '@/lib/utils';

/**
 * 펄스 스켈레톤 자리표시 블록 — 넓은 영역 로딩에 쓴다.
 * 크기·라운드는 className 으로 지정(기본 라운드 없음 — rounded-full/medium 등 호출부가 준다).
 * motion-reduce 에서 펄스를 끈다.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse bg-[var(--md-sys-color-surface-container-high)] motion-reduce:animate-none',
        className,
      )}
    />
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/primitives/__tests__/Skeleton.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/primitives/Skeleton.tsx components/primitives/__tests__/Skeleton.test.tsx
git commit -m "feat(ui): add Skeleton pulse placeholder primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `TypingDots` 프리미티브

**Files:**
- Create: `components/messages/TypingDots.tsx`
- Test: `components/messages/__tests__/TypingDots.test.tsx`

**Interfaces:**
- Produces: `<TypingDots className?, label?='입력 중' />` — `role="status"` + `aria-label` 인 펄스 점 3개. Task 6 의 타이핑 인디케이터가 소비.

- [ ] **Step 1: 실패 테스트 작성**

Create `components/messages/__tests__/TypingDots.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TypingDots } from '../TypingDots';

afterEach(cleanup);

describe('TypingDots', () => {
  it('aria-label "입력 중" 인 status 를 렌더한다', () => {
    render(<TypingDots />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '입력 중');
  });

  it('펄스 점 3개를 렌더한다', () => {
    render(<TypingDots />);
    const dots = screen.getByRole('status').querySelectorAll('span[aria-hidden]');
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveClass('animate-pulse');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/messages/__tests__/TypingDots.test.tsx`
Expected: FAIL — `TypingDots` 모듈 없음.

- [ ] **Step 3: 구현**

Create `components/messages/TypingDots.tsx`:

```tsx
import { cn } from '@/lib/utils';

/**
 * 타이핑·인라인 로딩 인디케이터 — staggered 펄스 점 3개.
 * 접근성: role=status + aria-label. motion-reduce 에서 정지.
 */
export function TypingDots({ className, label = '입력 중' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex items-center gap-1', className)}>
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)] [animation-delay:0ms] motion-reduce:animate-none" />
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)] [animation-delay:150ms] motion-reduce:animate-none" />
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)] [animation-delay:300ms] motion-reduce:animate-none" />
    </span>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/messages/__tests__/TypingDots.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/messages/TypingDots.tsx components/messages/__tests__/TypingDots.test.tsx
git commit -m "feat(messages): add TypingDots pulse indicator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `DateDivider` 컴포넌트

**Files:**
- Create: `components/messages/DateDivider.tsx`
- Test: `components/messages/__tests__/DateDivider.test.tsx`

**Interfaces:**
- Produces: `<DateDivider label={string} />` — `role="separator"` + 가운데 칩. Task 7 이 ThreadView·TeamThreadView 에서 소비.

- [ ] **Step 1: 실패 테스트 작성**

Create `components/messages/__tests__/DateDivider.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DateDivider } from '../DateDivider';

afterEach(cleanup);

describe('DateDivider', () => {
  it('role="separator" 와 날짜 라벨 칩을 렌더한다', () => {
    render(<DateDivider label="6월 22일 월요일" />);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveTextContent('6월 22일 월요일');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/messages/__tests__/DateDivider.test.tsx`
Expected: FAIL — `DateDivider` 모듈 없음.

- [ ] **Step 3: 구현**

Create `components/messages/DateDivider.tsx`:

```tsx
/** 날짜 구분선 — 가운데 은은한 surface 칩. ThreadView·TeamThreadView 공용(드리프트 방지). */
export function DateDivider({ label }: { label: string }) {
  return (
    <div role="separator" className="flex justify-center py-1.5">
      <span className="rounded-[var(--md-sys-shape-full)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-2.5 py-0.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/messages/__tests__/DateDivider.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/messages/DateDivider.tsx components/messages/__tests__/DateDivider.test.tsx
git commit -m "feat(messages): add DateDivider chip component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 대화 목록 폴리시 (`ConversationList`)

**Files:**
- Modify: `components/messages/ConversationList.tsx`
- Test: `components/messages/__tests__/ConversationList.test.tsx` (기존 2개 수정 + 신규 추가)

**Interfaces:**
- Consumes: `InboxListItem` (기존). 변경 없음 — 표시만 달라진다.

변경 요약: ① 안읽음 = 이름 `font-semibold` + 미리보기 진하게 + **파란 점 제거**, 대신 `sr-only "읽지 않음"`. ② 선택 행 왼쪽 2px primary 액센트 바. ③ counterparty·team RFP 를 `코드 · 제목` 한 줄로 통일. ④ 팀 행 이름 = `팀 채팅`.

- [ ] **Step 1: 기존 테스트 2개 수정 + 신규 추가**

`components/messages/__tests__/ConversationList.test.tsx` 에서 기존 두 테스트(현재 `shows the unread dot...` / `hides the unread dot...`)를 아래로 **교체**하고, 신규 2개를 추가:

```tsx
  it('안읽음이면 sr-only "읽지 않음" 라벨을 표시하고 시각적 점은 없다', () => {
    render(
      <ConversationList items={[makeCounterparty({ unread: true })]} selectedKey={null} onSelect={vi.fn()} />,
    );
    const label = screen.getByText('읽지 않음');
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass('sr-only');
  });

  it('읽음이면 "읽지 않음" 라벨을 표시하지 않는다', () => {
    render(
      <ConversationList items={[makeCounterparty({ unread: false })]} selectedKey={null} onSelect={vi.fn()} />,
    );
    expect(screen.queryByText('읽지 않음')).not.toBeInTheDocument();
  });

  it('안읽음이면 이름을 굵게(font-semibold) 표시한다', () => {
    render(
      <ConversationList items={[makeCounterparty({ unread: true, counterparty: { workspaceId: 'pg-1', name: '굵은이름', type: 'pg', logoUpdatedAt: null } })]} selectedKey={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('굵은이름')).toHaveClass('font-semibold');
  });

  it('팀 항목 이름줄은 "팀 채팅" 으로 표시한다', () => {
    render(<ConversationList items={[makeTeam()]} selectedKey={null} onSelect={vi.fn()} />);
    expect(screen.getByText('팀 채팅')).toBeInTheDocument();
  });
```

> 나머지 기존 테스트(미리보기·RFP 코드/제목·시각·프레즌스·클릭·aria-current)는 텍스트가 그대로 보존되므로 수정 없이 green 이어야 한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/messages/__tests__/ConversationList.test.tsx`
Expected: FAIL — 신규 4케이스 실패(아직 점 제거·sr-only·"팀 채팅" 미구현).

- [ ] **Step 3: 구현 — `ConversationList.tsx` 전체 교체**

```tsx
'use client';

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarWithPresence } from '@/components/presence/AvatarWithPresence';
import { formatListTime } from './format';
import type { InboxListItem } from './types';

type Props = {
  items: InboxListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export function ConversationList({ items, selectedKey, onSelect }: Props) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const active = item.key === selectedKey;
        const name = item.kind === 'team' ? '팀 채팅' : item.counterparty.name;
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSelect(item.key)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full items-start gap-2.5 border-b border-l-2 border-b-[var(--md-sys-color-outline-variant)] px-3 py-3 text-left transition-colors',
                active
                  ? 'border-l-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container)]'
                  : 'border-l-transparent hover:bg-[var(--md-sys-color-surface-container-low)]',
              )}
            >
              {item.kind === 'team' ? (
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-full)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]"
                >
                  <Users size={18} strokeWidth={1.5} />
                </span>
              ) : (
                <AvatarWithPresence
                  name={item.counterparty.name}
                  workspaceId={item.counterparty.workspaceId}
                  logoUpdatedAt={item.counterparty.logoUpdatedAt}
                  size="md"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'truncate text-[13px] text-[var(--md-sys-color-on-surface)]',
                      item.unread ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {name}
                  </span>
                  {item.lastMessageAt && (
                    <time
                      dateTime={item.lastMessageAt}
                      className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]"
                    >
                      {formatListTime(item.lastMessageAt)}
                    </time>
                  )}
                </div>
                {/* RFP 줄 — counterparty·team 공통(코드 · 제목) */}
                {item.rfpCode && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    <span className="md-numeric shrink-0 font-medium text-[var(--md-sys-color-primary)]">
                      {item.rfpCode}
                    </span>
                    <span className="truncate">· {item.rfpTitle}</span>
                  </div>
                )}
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p
                    className={cn(
                      'min-w-0 flex-1 truncate text-[12px]',
                      item.unread
                        ? 'text-[var(--md-sys-color-on-surface)]'
                        : 'text-[var(--md-sys-color-on-surface-variant)]',
                    )}
                  >
                    {item.preview}
                  </p>
                  {item.unread && <span className="sr-only">읽지 않음</span>}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

> 참고: counterparty 의 `rfpCode` 는 `string | null`, team 은 항상 `string` — 둘 다 `item.rfpCode` 로 접근 가능(가드 `item.rfpCode` 가 null 을 걸러냄). `border-l-2` 를 항상 깔고 active 일 때만 색을 줘 레이아웃 시프트를 막는다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/messages/__tests__/ConversationList.test.tsx`
Expected: PASS (신규 4 + 기존 전부)

- [ ] **Step 5: 커밋**

```bash
git add components/messages/ConversationList.tsx components/messages/__tests__/ConversationList.test.tsx
git commit -m "feat(messages): 대화 목록 안읽음 강조(점 제거)·선택 액센트·RFP 줄 통일

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 스레드 헤더 폴리시 (`ThreadView` — 온라인 라벨·RFP 컨텍스트·타이핑 점)

**Files:**
- Modify: `components/messages/ThreadView.tsx` (헤더 블록 + import)
- Test: `components/messages/__tests__/ThreadView.test.tsx` (타이핑 2개 수정 + 신규 2개)

**Interfaces:**
- Consumes: `TypingDots` (Task 3), `online`(기존 `useWorkspacePresence`), `rfpContext`(기존 prop), `variant`(기존).

- [ ] **Step 1: 타이핑 테스트 2개 수정 + 신규 추가**

`ThreadView.test.tsx` 에서 기존 `typingUserIds 가 있으면 "입력 중…" ...` / `... 비어 있으면 ...` 두 테스트를 아래로 **교체**하고 신규 추가:

```tsx
  it('typingUserIds 가 있으면 타이핑 점(TypingDots)을 렌더한다', () => {
    channelResult = { typingUserIds: ['pg-user-1'], sendTyping, connected: null };
    render(base());
    expect(screen.getByLabelText('입력 중')).toBeInTheDocument();
  });

  it('typingUserIds 가 비어 있으면 타이핑 점을 렌더하지 않는다', () => {
    render(base());
    expect(screen.queryByLabelText('입력 중')).not.toBeInTheDocument();
  });

  it('online 이면 헤더에 "온라인" 텍스트 라벨을 표시한다', () => {
    workspacePresenceResult = { online: true, activity: 'active' };
    render(base());
    expect(screen.getByText('온라인')).toBeInTheDocument();
  });

  it('rfpContext 가 있으면(page 변형) 헤더에 RFP 코드·제목을 표시한다', () => {
    render(base({ rfpContext: { code: 'P-2605-0042', title: '온라인 결제 견적' } }));
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
    expect(screen.getByText(/온라인 결제 견적/)).toBeInTheDocument();
  });
```

> 기존 `getByLabelText('온라인')`(PresenceDot) 테스트는 그대로 둔다 — 점의 aria-label 과 새 텍스트 라벨은 별개 쿼리다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/messages/__tests__/ThreadView.test.tsx`
Expected: FAIL — `입력 중` 라벨/`온라인` 텍스트/RFP 헤더 줄 미구현.

- [ ] **Step 3: 구현 — 헤더 블록 교체 + import**

`ThreadView.tsx` 상단 import 에 추가:

```tsx
import { TypingDots } from './TypingDots';
```

헤더 안 `<div className="min-w-0 flex-1">` 블록(현재 이름줄 + `입력 중…` span)을 아래로 교체:

```tsx
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
              {counterparty.name}
            </span>
            <Chip label={COUNTERPARTY_TYPE_LABEL[counterparty.type]} color="surface" />
            {online && (
              <>
                <span aria-hidden className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">·</span>
                <span className="text-[11px] font-medium text-[var(--md-sys-color-tertiary)]">온라인</span>
              </>
            )}
          </div>
          {typingUserIds.length > 0 ? (
            <TypingDots className="mt-1" />
          ) : variant !== 'tabs' && rfpContext?.code ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              <span className="md-numeric font-medium text-[var(--md-sys-color-primary)]">{rfpContext.code}</span>
              {rfpContext.title && <span className="truncate">· {rfpContext.title}</span>}
            </div>
          ) : null}
        </div>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/messages/__tests__/ThreadView.test.tsx`
Expected: PASS (신규 4 + 기존 전부; tabs 변형 테스트는 헤더 RFP 줄을 숨기므로 영향 없음)

- [ ] **Step 5: 커밋**

```bash
git add components/messages/ThreadView.tsx components/messages/__tests__/ThreadView.test.tsx
git commit -m "feat(messages): 스레드 헤더에 온라인 라벨·RFP 컨텍스트·타이핑 점

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 날짜 칩 구분선 적용 (`ThreadView` + `TeamThreadView`)

> **드리프트 반영:** 아바타 리사이즈는 제외(Task 1 SKIPPED 참조 — 아바타가 인터랙티브 `UserProfileCard`라 24px 유지). 이 태스크는 **날짜 구분선 → `DateDivider` 스왑만** 수행한다. (현재 코드에는 메시지 morph 코드가 추가돼 있지만 구분선 블록은 영향 없음.)

**Files:**
- Modify: `components/messages/ThreadView.tsx` (날짜 구분선 블록만)
- Modify: `components/messages/TeamThreadView.tsx` (동일)
- Test: 신규 없음 — 기존 `ThreadView.test.tsx`·`TeamThreadView.test.tsx` 의 구분선 테스트(`role="separator"` + 날짜 텍스트)가 회귀 가드.

**Interfaces:**
- Consumes: `DateDivider` (Task 4).

- [ ] **Step 1: 구현 — `ThreadView.tsx`**

import 추가:

```tsx
import { DateDivider } from './DateDivider';
```

날짜 구분선 블록(주석 포함 `{showDivider && (<div role="separator" className="flex justify-center py-1.5">…{dayLabel}…</div>)}` 전체)을 교체:

```tsx
              {showDivider && <DateDivider label={dayLabel} />}
```

- [ ] **Step 2: 구현 — `TeamThreadView.tsx`**

import 추가:

```tsx
import { DateDivider } from './DateDivider';
```

날짜 구분선 블록(`{showDivider && (<div role="separator" className="flex justify-center py-1.5">…{dayLabel}…</div>)}` 전체)을 교체:

```tsx
              {showDivider && <DateDivider label={dayLabel} />}
```

- [ ] **Step 3: 회귀 테스트 실행**

Run: `pnpm test components/messages/__tests__/ThreadView.test.tsx components/messages/__tests__/TeamThreadView.test.tsx`
Expected: PASS — 구분선은 여전히 `role="separator"` + 날짜 텍스트(예: `5월 26일`)를 가지고, 작성자 이름 헤더도 그대로라 기존 단언이 모두 green.

- [ ] **Step 4: 커밋**

```bash
git add components/messages/ThreadView.tsx components/messages/TeamThreadView.tsx
git commit -m "refactor(messages): 날짜 칩 구분선 DateDivider 공용화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 첨부 갤러리 상태 통일 (`AttachmentGalleryPanel`)

**Files:**
- Modify: `components/messages/AttachmentGalleryPanel.tsx`
- Test: `components/messages/__tests__/AttachmentGalleryPanel.test.tsx` (로딩·빈 테스트 2개 수정)

**Interfaces:**
- Consumes: `Skeleton` (Task 2), `EmptyState`(기존, `icon`/`description`/`className` 지원 확인됨).

- [ ] **Step 1: 로딩·빈 테스트 2개 수정**

`AttachmentGalleryPanel.test.tsx` 에서 기존 두 테스트를 교체:

```tsx
  it('로딩 중에는 스켈레톤(status)을 표시한다', async () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AttachmentGalleryPanel conversationId="conv-1" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '첨부파일 불러오는 중');
  });

  it('첨부파일이 없으면 빈 상태 안내를 표시한다', async () => {
    mockList.mockResolvedValue([]);
    render(<AttachmentGalleryPanel conversationId="conv-1" />);
    await waitFor(() => {
      expect(screen.getByText('공유된 파일이 없어요')).toBeDefined();
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/messages/__tests__/AttachmentGalleryPanel.test.tsx`
Expected: FAIL — 아직 `LOADING…`/`첨부파일 없음` 텍스트라 신규 단언 실패.

- [ ] **Step 3: 구현 — `AttachmentGalleryPanel.tsx`**

import 교체/추가:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { Skeleton } from '@/components/primitives/Skeleton';
import { EmptyState } from '@/components/primitives/EmptyState';
import { listConversationAttachments } from '@/lib/server/actions/chat/listConversationAttachments';
import type { Attachment } from '@/lib/types/common';
```

로딩·빈 분기 교체:

```tsx
  if (files === null) {
    return (
      <div role="status" aria-label="첨부파일 불러오는 중" className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-[var(--md-sys-shape-medium)]" />
        <Skeleton className="h-16 w-full rounded-[var(--md-sys-shape-medium)]" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<Paperclip />}
        title="공유된 파일이 없어요"
        description="대화에서 주고받은 파일이 여기 모여요."
        className="py-12"
      />
    );
  }
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/messages/__tests__/AttachmentGalleryPanel.test.tsx`
Expected: PASS (수정 2 + 기존 목록/전환 테스트 green)

- [ ] **Step 5: 커밋**

```bash
git add components/messages/AttachmentGalleryPanel.tsx components/messages/__tests__/AttachmentGalleryPanel.test.tsx
git commit -m "feat(messages): 첨부 갤러리 로딩=스켈레톤·빈=EmptyState 로 통일

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 스레드 로딩 스켈레톤 강화 (`ThreadSkeleton`)

**Files:**
- Modify: `components/messages/ThreadSkeleton.tsx`
- Test: `components/messages/__tests__/ThreadSkeleton.test.tsx` (신규)

**Interfaces:**
- Consumes: `Skeleton` (Task 2).

- [ ] **Step 1: 실패 테스트 작성**

Create `components/messages/__tests__/ThreadSkeleton.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ThreadSkeleton } from '../ThreadSkeleton';

afterEach(cleanup);

describe('ThreadSkeleton', () => {
  it('메시지 모양을 포함한 펄스 스켈레톤 자리표시를 5개 이상 렌더한다', () => {
    const { container } = render(<ThreadSkeleton />);
    // 현재(3개: 헤더 아바타·이름·입력칸)보다 강화 — 헤더 2 + 메시지 3 + 입력 1 = 6.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test components/messages/__tests__/ThreadSkeleton.test.tsx`
Expected: FAIL — 현재 ThreadSkeleton 은 `animate-pulse` 가 3개뿐(>=5 미달).

- [ ] **Step 3: 구현 — `ThreadSkeleton.tsx` 교체**

```tsx
import { Skeleton } from '@/components/primitives/Skeleton';

export function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <Skeleton className="size-8 rounded-[var(--md-sys-shape-full)]" />
        <Skeleton className="h-4 w-32 rounded-[var(--md-sys-shape-extra-small)]" />
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <Skeleton className="h-10 w-2/3 rounded-[var(--md-sys-shape-medium)]" />
        <Skeleton className="h-10 w-1/2 self-end rounded-[var(--md-sys-shape-medium)]" />
        <Skeleton className="h-10 w-3/5 rounded-[var(--md-sys-shape-medium)]" />
      </div>
      <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <Skeleton className="h-9 w-full rounded-[var(--md-sys-shape-small)]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test components/messages/__tests__/ThreadSkeleton.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/messages/ThreadSkeleton.tsx components/messages/__tests__/ThreadSkeleton.test.tsx
git commit -m "refactor(messages): ThreadSkeleton 을 Skeleton 프리미티브로 + 메시지 모양 강화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 디자인 원칙 갱신 (로딩 모션 허용)

**Files:**
- Modify: `CLAUDE.md` (line 125 의 로딩 룰)
- Modify: `DESIGN.md` (§9, line 212 의 펄스/모멘텀 룰)

**Interfaces:** 없음(문서). 테스트 없음 — 자동 드리프트 가드 없음을 확인(기존 `animate-spin/pulse` 사용처가 green).

- [ ] **Step 1: `CLAUDE.md` 수정**

다음 줄을 찾는다:

```text
- **No** pulse/spinner loading. Use `LOADING…` text (body-medium type). (예외: DESIGN.md §9 "축하 모먼트" — 종결 성공 1회성에 한해 컨페티 허용.)
```

아래로 교체:

```text
- **로딩 모션 허용** — 넓은 영역은 펄스 스켈레톤, 인라인·타이핑 인디케이터는 펄스 점(staggered). `prefers-reduced-motion: reduce` 존중(저감 시 정지/단순화). 버튼 진행 등 짧은 `LOADING…` 텍스트 표기는 그대로 두어도 무방. 장식적 컨페티·강한 모멘텀 모션 제한은 유지(DESIGN.md §9 "축하 모먼트" 예외만).
```

- [ ] **Step 2: `DESIGN.md` §9 수정**

다음 줄을 찾는다:

```text
- **No** 컨페티·펄스·강한 모멘텀 모션 — 단 하나의 예외(아래 "축하 모먼트")만 허용.
```

아래로 교체:

```text
- **No** 장식적 컨페티·강한 모멘텀 모션 — 단 하나의 예외(아래 "축하 모먼트")만 허용. **단 기능적 로딩 모션은 허용**: 넓은 영역은 펄스 스켈레톤, 인라인·타이핑 인디케이터는 펄스 점. 모두 `prefers-reduced-motion: reduce`를 존중하며(저감 시 정지), 채팅 표면은 스켈레톤·점을 우선한다.
```

- [ ] **Step 3: 정합 확인**

Run: `pnpm lint && pnpm tsc --noEmit`
Expected: 둘 다 통과(문서 변경이라 코드 영향 없음). `styles/tokens.css` 동기화 불필요(토큰값 변경 아님).

- [ ] **Step 4: 커밋**

```bash
git add CLAUDE.md DESIGN.md
git commit -m "docs(design): 로딩 모션 원칙 갱신 — 펄스 스켈레톤·점 허용(컨페티 제한 유지)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 전체 그린 + 정합 최종 확인

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 테스트**

Run: `pnpm test`
Expected: 전부 PASS. (특히 `components/messages/**`, `components/primitives/**`)

- [ ] **Step 2: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 에러 0.

- [ ] **Step 3: 수동 시각 확인(선택)**

`/messages` 와 딜룸 레일에서 — 대칭 컴팩트 헤더·점 없는 안읽음·선택 액센트·RFP 줄·헤더 온라인/RFP·날짜 칩·타이핑 점·로딩 스켈레톤·빈 상태를 육안 확인. (자동 테스트가 회귀를 막지만 시각 폴리시는 눈으로 한 번.)

---

## 부록: 스코프 밖(후속 PR 후보)

- **전역 `LOADING…` → 스켈레톤/점 마이그레이션(B안)**: 버튼 라벨·Suspense 폴백 등 ~40곳. 원칙상 허용되나 테스트 다수 동반 → 별도 PR.
- 타이핑 점 모션을 opacity 펄스 → translateY bounce 로 바꾸려면 `app/globals.css` 에 keyframe 추가 + `motion-reduce` 가드(이번엔 opacity 펄스로 충분).
