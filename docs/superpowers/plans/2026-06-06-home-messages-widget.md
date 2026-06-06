# Home Messages Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `ChatPanelPlaceholder` on the home screen with a `RecentMessagesPanel` that shows real recent conversations (server snapshot, read-only) and deep-links rows to `/messages?c=<id>`.

**Architecture:** Pure helper `buildHomeMessagesSnapshot` processes inbox loader output; new `RecentMessagesPanel` component renders the widget; `PgHome`/`BuyerHome` server components run `listConversationsForViewer()` in parallel with dashboard load and pass results to `HomeDashboard`; `/messages` page gains `?c=` searchParam support so clicked rows auto-select the conversation on arrival.

**Tech Stack:** Next.js App Router (server components), `listConversationsForViewer` (existing server action), `ConversationListItem` (existing type), `WorkspaceAvatar` + `EmptyState` (existing primitives), `next/link`, Vitest + Testing Library.

---

## File Map

| Action | File |
|--------|------|
| **Create** | `lib/server/dashboard/homeMessages.ts` |
| **Create** | `lib/server/dashboard/__tests__/homeMessages.test.ts` |
| **Create** | `components/home/RecentMessagesPanel.tsx` |
| **Create** | `components/home/__tests__/RecentMessagesPanel.test.tsx` |
| **Modify** | `components/messages/MessageInbox.tsx` |
| **Modify** | `components/messages/__tests__/MessageInbox.test.tsx` |
| **Modify** | `app/(app)/messages/page.tsx` |
| **Modify** | `components/home/HomeDashboard.tsx` |
| **Modify** | `components/home/PgHome.tsx` |
| **Modify** | `components/home/BuyerHome.tsx` |
| **Delete** | `components/home/ChatPanelPlaceholder.tsx` |
| **Delete** | `components/home/__tests__/ChatPanelPlaceholder.test.tsx` |

---

## Task 1: `buildHomeMessagesSnapshot` — pure helper function

**Files:**
- Create: `lib/server/dashboard/homeMessages.ts`
- Create: `lib/server/dashboard/__tests__/homeMessages.test.ts`

- [ ] **Step 1.1: Write the failing test**

```typescript
// lib/server/dashboard/__tests__/homeMessages.test.ts
import { describe, it, expect } from 'vitest';
import { buildHomeMessagesSnapshot } from '../homeMessages';
import type { ConversationListItem } from '@/components/messages/types';

function conv(overrides?: Partial<ConversationListItem>): ConversationListItem {
  return {
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'ws-1', name: '회사', type: 'pg', hasLogo: false },
    rfpId: null,
    preview: '안녕하세요',
    lastMessageAt: '2026-06-06T10:00:00.000Z',
    unread: false,
    ...overrides,
  };
}

describe('buildHomeMessagesSnapshot', () => {
  it('conversations without a lastMessageAt are excluded from the preview list', () => {
    const input = [
      conv({ conversationId: 'has-msg', lastMessageAt: '2026-06-06T10:00:00.000Z' }),
      conv({ conversationId: 'no-msg', lastMessageAt: null }),
    ];
    const { conversations } = buildHomeMessagesSnapshot(input);
    expect(conversations.map((c) => c.conversationId)).toEqual(['has-msg']);
  });

  it('unreadCount counts ALL conversations with unread=true, including those without messages', () => {
    const input = [
      conv({ conversationId: 'a', unread: true, lastMessageAt: '2026-06-06T10:00:00.000Z' }),
      conv({ conversationId: 'b', unread: true, lastMessageAt: null }),
      conv({ conversationId: 'c', unread: false, lastMessageAt: '2026-06-06T11:00:00.000Z' }),
    ];
    const { unreadCount } = buildHomeMessagesSnapshot(input);
    expect(unreadCount).toBe(2);
  });

  it('preserves the input sort order (caller-determined)', () => {
    const input = [
      conv({ conversationId: 'first', lastMessageAt: '2026-06-06T12:00:00.000Z' }),
      conv({ conversationId: 'second', lastMessageAt: '2026-06-06T09:00:00.000Z' }),
    ];
    const { conversations } = buildHomeMessagesSnapshot(input);
    expect(conversations.map((c) => c.conversationId)).toEqual(['first', 'second']);
  });

  it('returns an empty conversations list and zero unreadCount for an empty input', () => {
    const result = buildHomeMessagesSnapshot([]);
    expect(result).toEqual({ conversations: [], unreadCount: 0 });
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails (RED)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/dashboard/__tests__/homeMessages.test.ts
```

Expected: FAIL — `Cannot find module '../homeMessages'`

- [ ] **Step 1.3: Implement the minimal code**

```typescript
// lib/server/dashboard/homeMessages.ts
import type { ConversationListItem } from '@/components/messages/types';

export type HomeMessagesSnapshot = {
  /** Conversations that have at least one message, in loader sort order. */
  conversations: ConversationListItem[];
  /** Unread count across ALL conversations (before the preview filter). */
  unreadCount: number;
};

/**
 * Shapes the inbox loader output into what the home messages widget needs.
 * Pure function — no I/O, no side effects.
 */
export function buildHomeMessagesSnapshot(
  conversations: ConversationListItem[],
): HomeMessagesSnapshot {
  return {
    conversations: conversations.filter((c) => c.lastMessageAt !== null),
    unreadCount: conversations.filter((c) => c.unread).length,
  };
}
```

- [ ] **Step 1.4: Run test to verify it passes (GREEN)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/dashboard/__tests__/homeMessages.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add lib/server/dashboard/homeMessages.ts lib/server/dashboard/__tests__/homeMessages.test.ts
git commit -m "feat(home): buildHomeMessagesSnapshot — inbox data → widget shape"
```

---

## Task 2: `RecentMessagesPanel` component

**Files:**
- Create: `components/home/RecentMessagesPanel.tsx`
- Create: `components/home/__tests__/RecentMessagesPanel.test.tsx`

- [ ] **Step 2.1: Write the failing test**

```typescript
// components/home/__tests__/RecentMessagesPanel.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ConversationListItem } from '@/components/messages/types';

// next/link renders as <a> in jsdom
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...(rest as object)}>
      {children}
    </a>
  ),
}));

// WorkspaceAvatar makes no assertions here; stub to keep render fast and pure.
vi.mock('@/components/primitives/WorkspaceAvatar', () => ({
  WorkspaceAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span>,
}));

afterEach(() => cleanup());

import { RecentMessagesPanel } from '../RecentMessagesPanel';

function makeConv(overrides?: Partial<ConversationListItem>): ConversationListItem {
  return {
    conversationId: 'conv-abc',
    counterparty: { workspaceId: 'ws-pg', name: 'NICE페이', type: 'pg', hasLogo: false },
    rfpId: null,
    preview: '검토 부탁드립니다.',
    lastMessageAt: '2026-06-06T01:00:00.000Z',
    unread: false,
    ...overrides,
  };
}

describe('RecentMessagesPanel', () => {
  it('renders a conversation row with a deep-link to /messages?c=<id>', () => {
    render(<RecentMessagesPanel conversations={[makeConv({ conversationId: 'conv-xyz' })]} unreadCount={0} />);
    const link = screen.getByRole('link', { name: /NICE페이/ });
    expect(link).toHaveAttribute('href', '/messages?c=conv-xyz');
  });

  it('shows at most 4 conversation rows (HOME_RECENT_MESSAGES cap)', () => {
    const convs = Array.from({ length: 5 }, (_, i) =>
      makeConv({
        conversationId: `conv-${i}`,
        counterparty: { workspaceId: `ws-${i}`, name: `회사 ${i}`, type: 'pg', hasLogo: false },
      }),
    );
    render(<RecentMessagesPanel conversations={convs} unreadCount={0} />);
    const links = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/messages?c='));
    expect(links).toHaveLength(4);
  });

  it('shows an unread badge when unreadCount > 0', () => {
    render(<RecentMessagesPanel conversations={[makeConv()]} unreadCount={3} />);
    expect(screen.getByLabelText('읽지 않은 메시지 3개')).toBeInTheDocument();
  });

  it('does not show an unread badge when unreadCount is 0', () => {
    render(<RecentMessagesPanel conversations={[makeConv()]} unreadCount={0} />);
    expect(screen.queryByLabelText(/읽지 않은 메시지/)).not.toBeInTheDocument();
  });

  it('renders the empty state when conversations is empty', () => {
    render(<RecentMessagesPanel conversations={[]} unreadCount={0} />);
    expect(screen.getByText('아직 주고받은 메시지가 없어요')).toBeInTheDocument();
  });

  it('renders a "메시지 전체 보기" link to /messages', () => {
    render(<RecentMessagesPanel conversations={[]} unreadCount={0} />);
    expect(screen.getByRole('link', { name: '메시지 전체 보기' })).toHaveAttribute(
      'href',
      '/messages',
    );
  });

  it('shows an unread dot on a conversation row when c.unread is true', () => {
    render(
      <RecentMessagesPanel
        conversations={[makeConv({ unread: true })]}
        unreadCount={1}
      />,
    );
    expect(screen.getByLabelText('읽지 않음')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails (RED)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/home/__tests__/RecentMessagesPanel.test.tsx
```

Expected: FAIL — `Cannot find module '../RecentMessagesPanel'`

- [ ] **Step 2.3: Implement the component**

```tsx
// components/home/RecentMessagesPanel.tsx
import Link from 'next/link';
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import type { ConversationListItem } from '@/components/messages/types';

/** Max conversations previewed in the home widget; the rest are in /messages. */
const HOME_RECENT_MESSAGES = 4;

// Formats as "오전 10:00" in Asia/Seoul regardless of runner TZ — matches
// ConversationList's formatting rule to stay consistent.
function formatLastMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Home screen right-sidebar widget. Shows the most recent conversations as a
 * server snapshot (no realtime subscription). Each row deep-links to
 * /messages?c=<id> so the /messages page can pre-select the conversation.
 */
export function RecentMessagesPanel({
  conversations,
  unreadCount,
}: {
  conversations: ConversationListItem[];
  unreadCount: number;
}) {
  const recent = conversations.slice(0, HOME_RECENT_MESSAGES);

  return (
    <aside
      aria-label="메시지"
      className="flex h-full min-h-[320px] flex-col rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
    >
      <header className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
        메시지
        {unreadCount > 0 && (
          <span
            aria-label={`읽지 않은 메시지 ${unreadCount}개`}
            className="md-numeric inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[var(--md-sys-shape-full)] bg-[var(--md-sys-color-primary)] px-1.5 text-[11px] font-medium text-[var(--md-sys-color-on-primary)]"
          >
            {unreadCount}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {recent.length === 0 ? (
          <EmptyState
            icon={<EnvelopeIcon />}
            title="아직 주고받은 메시지가 없어요"
            description="구매사·PG와 나눈 대화가 여기에 표시돼요."
          />
        ) : (
          <ul className="flex flex-col">
            {recent.map((c) => (
              <li key={c.conversationId}>
                <Link
                  href={`/messages?c=${c.conversationId}`}
                  className="flex w-full items-start gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-3 transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
                >
                  <WorkspaceAvatar
                    name={c.counterparty.name}
                    size="md"
                    workspaceId={c.counterparty.workspaceId}
                    hasLogo={c.counterparty.hasLogo}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                        {c.counterparty.name}
                      </span>
                      {c.lastMessageAt && (
                        <time
                          dateTime={c.lastMessageAt}
                          className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]"
                        >
                          {formatLastMessageTime(c.lastMessageAt)}
                        </time>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                        {c.preview}
                      </p>
                      {c.unread && (
                        <span
                          aria-label="읽지 않음"
                          className="size-2 shrink-0 rounded-full bg-[var(--md-sys-color-primary)]"
                        />
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <Link
          href="/messages"
          className="block w-full rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] py-2 text-center text-[13px] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
        >
          메시지 전체 보기
        </Link>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2.4: Run test to verify it passes (GREEN)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/home/__tests__/RecentMessagesPanel.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add components/home/RecentMessagesPanel.tsx components/home/__tests__/RecentMessagesPanel.test.tsx
git commit -m "feat(home): RecentMessagesPanel — real conversation summary widget"
```

---

## Task 3: `MessageInbox` `initialSelectedId` prop

**Files:**
- Modify: `components/messages/MessageInbox.tsx`
- Modify: `components/messages/__tests__/MessageInbox.test.tsx`

- [ ] **Step 3.1: Add failing tests to `MessageInbox.test.tsx`**

Add these two `it` blocks inside the existing `describe('MessageInbox', ...)` block at the end of the file (before the closing `}`):

```typescript
  it('initialSelectedId로 마운트 시 해당 대화의 스레드를 즉시 보여준다', async () => {
    loadConversationThread.mockResolvedValue({
      ok: true,
      conversationId: 'conv-1',
      counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' },
      messages: [
        {
          id: 'm1',
          sender: 'other',
          body: '미리 열린 스레드 메시지입니다.',
          rfpId: null,
          createdAt: '2026-06-06T01:00:00.000Z',
          readByCounterparty: false,
          attachments: [],
        },
      ],
    });

    await act(async () => {
      render(<MessageInbox conversations={conversations} initialSelectedId="conv-1" />);
    });

    expect(loadConversationThread).toHaveBeenCalledWith('conv-1');
    expect(screen.getByText('미리 열린 스레드 메시지입니다.')).toBeInTheDocument();
  });

  it('목록에 없는 initialSelectedId는 무시하고 미선택 상태로 마운트된다', () => {
    render(<MessageInbox conversations={conversations} initialSelectedId="conv-does-not-exist" />);
    expect(screen.getByText('대화를 선택하세요')).toBeInTheDocument();
    expect(loadConversationThread).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3.2: Run tests to verify they fail (RED)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/messages/__tests__/MessageInbox.test.tsx
```

Expected: the 2 new tests FAIL (prop not accepted yet); existing 6 tests pass.

- [ ] **Step 3.3: Update `MessageInbox.tsx` to accept `initialSelectedId`**

Replace the `Props` type and `useState` line only. The full updated top of the component:

```typescript
// components/messages/MessageInbox.tsx
'use client';

import { Suspense, useState } from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';
import { ConversationList } from './ConversationList';
import { NewConversationSheet } from './NewConversationSheet';
import { ThreadPane } from './ThreadPane';
import { ThreadSkeleton } from './ThreadSkeleton';
import type { ConversationListItem } from './types';

type Props = {
  conversations: ConversationListItem[];
  /** Pre-select a conversation on mount (e.g. from ?c= deep-link). Ignored if id not in list. */
  initialSelectedId?: string | null;
};

export function MessageInbox({ conversations, initialSelectedId = null }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const selected = conversations.find((c) => c.conversationId === selectedId) ?? null;
  // ... rest of the component body remains EXACTLY as before
```

Keep the rest of the function body (`return (...)`) unchanged.

- [ ] **Step 3.4: Run tests to verify all pass (GREEN)**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/messages/__tests__/MessageInbox.test.tsx
```

Expected: all 8 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add components/messages/MessageInbox.tsx components/messages/__tests__/MessageInbox.test.tsx
git commit -m "feat(messages): MessageInbox accepts initialSelectedId for deep-link open"
```

---

## Task 4: `/messages` page — `?c=` searchParam wiring

**Files:**
- Modify: `app/(app)/messages/page.tsx`

> **Note:** This is shell-level wiring — the logic lives in `MessageInbox` and is covered by Task 3's tests. No new test needed here.

- [ ] **Step 4.1: Update `app/(app)/messages/page.tsx`**

Replace the entire file content:

```typescript
// app/(app)/messages/page.tsx
// 메시지함 — /messages
//
// RFP별 비공개 스레드 모델의 메시지함. 인박스 목록은 서버 액션 로더로 실데이터를
// 전달하고, 스레드 메시지는 대화 선택 시 클라이언트에서 loadConversationThread 로
// 로드한다(MessageInbox 내부).
//
// ?c=<conversationId> searchParam: 홈 위젯 행 클릭 시 해당 대화를 자동 선택한다.
import { PageEnter } from '@/components/primitives/PageEnter';
import { PageHeader } from '@/components/shell/PageHeader';
import { MessageInbox } from '@/components/messages/MessageInbox';
import { listConversationsForViewer } from '@/lib/server/actions/chat/conversationLoaders';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const [conversations, { c: initialConvId }] = await Promise.all([
    listConversationsForViewer(),
    searchParams,
  ]);
  const unread = conversations.filter((conv) => conv.unread).length;

  return (
    <PageEnter className="flex h-full flex-col">
      <PageHeader title="메시지" count={unread} />
      <MessageInbox conversations={conversations} initialSelectedId={initialConvId ?? null} />
    </PageEnter>
  );
}
```

- [ ] **Step 4.2: Confirm typecheck**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -v "Cannot find name '(vi|describe|it|expect|beforeEach)'"
```

Expected: 0 errors in the changed files.

- [ ] **Step 4.3: Commit**

```bash
git add app/\(app\)/messages/page.tsx
git commit -m "feat(messages): support ?c=<id> deep-link to auto-select conversation"
```

---

## Task 5: Wire `HomeDashboard` to accept and render the new props

**Files:**
- Modify: `components/home/HomeDashboard.tsx`

> **Note:** `HomeDashboard` is a simple prop-threading shell. Logic is in `RecentMessagesPanel` (Task 2) and `buildHomeMessagesSnapshot` (Task 1). No new test needed here.

- [ ] **Step 5.1: Update `HomeDashboard.tsx`**

Replace the entire file content:

```tsx
// components/home/HomeDashboard.tsx
import { KpiStrip } from './KpiStrip';
import { ActionQueue } from './ActionQueue';
import { OnboardingActionList } from './OnboardingActionList';
import { RecentMessagesPanel } from './RecentMessagesPanel';
import { RefreshButton } from './RefreshButton';
import { OpportunityList } from '@/components/opportunities/OpportunityList';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckIcon } from '@/components/icons';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';
import type { ConversationListItem } from '@/components/messages/types';

const EMPTY_DESC: Record<'buyer' | 'pg', string> = {
  buyer: '새 견적이 오거나 마감이 다가오면 여기에 표시돼요.',
  pg: '구매사가 초대한 견적 요청이 여기에 표시돼요.',
};

/** 홈 미리보기에서 보여줄 오픈 RFP 최대 개수. 나머지는 /opportunities 전체 보기. */
const HOME_OPEN_RFP_PREVIEW = 5;

export function HomeDashboard({
  dashboard,
  workspaceType,
  conversations,
  unreadCount,
}: {
  dashboard: Dashboard;
  workspaceType: 'buyer' | 'pg';
  conversations: ConversationListItem[];
  unreadCount: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <RefreshButton />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <KpiStrip kpis={dashboard.kpis} />
          {dashboard.groups.length > 0 ? (
            <ActionQueue groups={dashboard.groups} />
          ) : dashboard.onboardingActions ? (
            <OnboardingActionList actions={dashboard.onboardingActions} />
          ) : (
            <EmptyState
              icon={<CheckIcon />}
              title="지금 처리할 일이 없습니다"
              description={EMPTY_DESC[workspaceType]}
            />
          )}
          {workspaceType === 'pg' &&
            dashboard.openRfps != null &&
            dashboard.openRfps.length > 0 && (
              <section>
                <h2 className="mb-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  참여 가능한 견적
                </h2>
                <OpportunityList
                  items={dashboard.openRfps}
                  limit={HOME_OPEN_RFP_PREVIEW}
                  showAllHref="/opportunities"
                />
              </section>
            )}
        </div>
        <div className="lg:w-[360px] lg:shrink-0">
          <RecentMessagesPanel conversations={conversations} unreadCount={unreadCount} />
        </div>
      </div>
    </div>
  );
}

// Named export (not a static on a 'use client' component) so a Server Component
// Suspense fallback can render it across the RSC boundary.
export function HomeDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-[var(--md-sys-shape-medium)]" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <Skeleton className="h-[320px] rounded-[var(--md-sys-shape-medium)] lg:w-[360px] lg:shrink-0" />
    </div>
  );
}
```

- [ ] **Step 5.2: Confirm typecheck**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -E "(HomeDashboard|RecentMessagesPanel)" | head -20
```

Expected: errors about `PgHome`/`BuyerHome` missing the new props — correct, we fix those in Task 6. Ignore those for now.

- [ ] **Step 5.3: Commit**

```bash
git add components/home/HomeDashboard.tsx
git commit -m "feat(home): HomeDashboard threads conversations/unreadCount to RecentMessagesPanel"
```

---

## Task 6: Feed data from `PgHome` and `BuyerHome`

**Files:**
- Modify: `components/home/PgHome.tsx`
- Modify: `components/home/BuyerHome.tsx`

> **Note:** These are server component shells — logic tested in Tasks 1 & 2. No new test needed.

- [ ] **Step 6.1: Update `PgHome.tsx`**

Replace the entire file:

```typescript
// components/home/PgHome.tsx
import { PageEnter } from '@/components/primitives/PageEnter';
import { loadPgDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listConversationsForViewer } from '@/lib/server/actions/chat/conversationLoaders';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function PgHome({ workspaceId }: { workspaceId: string }) {
  const [dashboard, allConversations] = await Promise.all([
    loadPgDashboard(workspaceId),
    listConversationsForViewer(),
  ]);
  const { conversations, unreadCount } = buildHomeMessagesSnapshot(allConversations);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="pg"
        conversations={conversations}
        unreadCount={unreadCount}
      />
    </PageEnter>
  );
}
```

- [ ] **Step 6.2: Update `BuyerHome.tsx`**

Replace the entire file:

```typescript
// components/home/BuyerHome.tsx
import { PageEnter } from '@/components/primitives/PageEnter';
import { loadBuyerDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listConversationsForViewer } from '@/lib/server/actions/chat/conversationLoaders';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function BuyerHome({ workspaceId }: { workspaceId: string }) {
  const [dashboard, allConversations] = await Promise.all([
    loadBuyerDashboard(workspaceId),
    listConversationsForViewer(),
  ]);
  const { conversations, unreadCount } = buildHomeMessagesSnapshot(allConversations);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="buyer"
        conversations={conversations}
        unreadCount={unreadCount}
      />
    </PageEnter>
  );
}
```

- [ ] **Step 6.3: Run full test suite and typecheck**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test && PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"
```

Expected: all tests pass; 0 new type errors (the wizard-test-globals false positives may still appear — those are pre-existing, per memory `typecheck-red-wizard-test-globals`).

- [ ] **Step 6.4: Commit**

```bash
git add components/home/PgHome.tsx components/home/BuyerHome.tsx
git commit -m "feat(home): PgHome/BuyerHome load conversations in parallel, pass to HomeDashboard"
```

---

## Task 7: Delete the placeholder

**Files:**
- Delete: `components/home/ChatPanelPlaceholder.tsx`
- Delete: `components/home/__tests__/ChatPanelPlaceholder.test.tsx`

- [ ] **Step 7.1: Delete the files**

```bash
git rm components/home/ChatPanelPlaceholder.tsx components/home/__tests__/ChatPanelPlaceholder.test.tsx
```

- [ ] **Step 7.2: Verify nothing else imports the placeholder**

```bash
grep -r "ChatPanelPlaceholder" . --include="*.tsx" --include="*.ts" --exclude-dir=node_modules
```

Expected: no output (zero references).

- [ ] **Step 7.3: Run full test suite + lint**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test && pnpm lint
```

Expected: all tests pass; no lint errors.

- [ ] **Step 7.4: Final commit**

```bash
git commit -m "chore(home): remove ChatPanelPlaceholder (replaced by RecentMessagesPanel)"
```

---

## Verification

After all tasks complete:

1. **Unit tests green:**
   ```bash
   PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
   ```

2. **Typecheck + lint clean:**
   ```bash
   PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"
   pnpm lint
   ```

3. **Live browser QA** (optional, uses e2e test DB on port 5433):
   - Copy `.env` from main repo into the worktree, change `DATABASE_URL` port to 5433
   - `pnpm dev`
   - Log in as `ws-toss-admin@example.com` / `password123` (PG account)
   - `/home` → right sidebar should show real conversations (or empty state if none seeded)
   - Click a row → `/messages` with that conversation auto-selected in the thread pane
   - "메시지 전체 보기" → `/messages` inbox, no selection
   - (Memory `live-browser-qa-authed-pages` has full setup notes)
