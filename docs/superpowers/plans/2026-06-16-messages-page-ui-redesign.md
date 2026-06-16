# Messages Page UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3-컬럼 레이아웃(xl), 헤더 탭(md), 대화 목록 검색+RFP 칩, 우측 컨텍스트 패널(RFP 카드+파일)로 메시지 페이지 UI를 업계 표준 B2B 메신저 수준으로 개선한다.

**Architecture:** MessageInbox가 xl 감지 훅으로 3-컬럼(list|thread|ContextPanel) 또는 2-컬럼(list|thread+tabs)을 렌더한다. ConversationListItem에 rfp 필드를 추가해 목록 항목에 RFP 칩을 인라인 표시하고, 우측 ContextPanel은 선택된 대화의 RFP 카드 + AttachmentGalleryPanel을 재사용한다. ThreadView는 `variant='tabs'` 시 헤더에 채팅/RFP/파일 탭을 추가하고 `variant='page'` 시 기존 갤러리 토글 버튼을 제거한다.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4 CSS vars, vitest + @testing-library/react (jsdom), pnpm test

---

## 파일 맵

| 경로 | 역할 | 상태 |
|---|---|---|
| `hooks/use-xl-up.ts` | useIsXlUp — 1280px 이상 감지 | **신규** |
| `components/messages/format.ts` | formatListTime 추가 | **수정** |
| `components/messages/__tests__/format.test.ts` | formatListTime 테스트 | **수정** |
| `lib/server/actions/chat/conversationLoaders.ts` | ConversationListItem에 rfpCode/Title/Status/Deadline 추가 | **수정** |
| `lib/server/actions/chat/__tests__/inboxLoader.test.ts` | rfp 필드 enrichment 테스트 | **수정** |
| `components/messages/ConversationList.tsx` | 검색 인풋 + RFP 칩 + formatListTime | **수정** |
| `components/messages/__tests__/ConversationList.test.tsx` | 검색/칩/시간 포맷 테스트 | **수정** |
| `components/messages/ContextPanel.tsx` | RFP 카드 + AttachmentGalleryPanel | **신규** |
| `components/messages/__tests__/ContextPanel.test.tsx` | ContextPanel 테스트 | **신규** |
| `components/messages/ThreadView.tsx` | tabs variant + rfpContext + gallery 버튼 제거(page) | **수정** |
| `components/messages/__tests__/ThreadView.test.tsx` | tabs 전환 테스트 | **수정** |
| `components/messages/ThreadPane.tsx` | rfpContext prop 관통 | **수정** |
| `components/messages/MessageInbox.tsx` | 3-컬럼 + search 상태 + xl 패널 | **수정** |
| `components/messages/__tests__/MessageInbox.test.tsx` | 검색/xl 패널 테스트 | **수정** |

---

## Task 1: useIsXlUp 훅

**Files:**
- Create: `hooks/use-xl-up.ts`

- [ ] **1.1 훅 파일 작성**

```ts
// hooks/use-xl-up.ts
import * as React from 'react';

const XL_BREAKPOINT = 1280;

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= XL_BREAKPOINT;
}

function getServerSnapshot(): boolean {
  return true; // 데스크톱 우선 SSR — 하이드레이션 깜빡임 최소화
}

/** 뷰포트 폭이 xl(1280px) 이상인지. 메시지 페이지 3-컬럼 전환 기준. */
export function useIsXlUp(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **1.2 커밋**

```bash
git add hooks/use-xl-up.ts
git commit -m "feat(hooks): add useIsXlUp for xl breakpoint detection"
```

---

## Task 2: formatListTime — 목록 항목 상대 시간 포맷

**Files:**
- Modify: `components/messages/format.ts`
- Modify: `components/messages/__tests__/format.test.ts`

- [ ] **2.1 실패 테스트 작성**

`components/messages/__tests__/format.test.ts` 파일에 아래를 **추가**한다 (기존 테스트 아래에):

```ts
import { formatListTime } from '../format';

describe('formatListTime', () => {
  // now = 2026-06-16T06:00:00Z (KST 15:00)
  const NOW = new Date('2026-06-16T06:00:00.000Z');

  it('오늘 메시지 → 오전/오후 HH:mm 형태', () => {
    const iso = '2026-06-16T05:00:00.000Z'; // 오늘 06:00Z 기준 오늘
    expect(formatListTime(iso, NOW)).toMatch(/^오[전후] \d{1,2}:\d{2}$/);
  });

  it('어제 메시지 → "어제"', () => {
    const iso = '2026-06-15T06:00:00.000Z'; // 하루 전
    expect(formatListTime(iso, NOW)).toBe('어제');
  });

  it('3일 전 → 요일 이름(~요일)', () => {
    const iso = '2026-06-13T06:00:00.000Z'; // 3일 전
    expect(formatListTime(iso, NOW)).toMatch(/요일$/);
  });

  it('7일 이상 전 → M/D 숫자', () => {
    const iso = '2026-06-01T06:00:00.000Z'; // 15일 전
    expect(formatListTime(iso, NOW)).toBe('6/1');
  });
});
```

- [ ] **2.2 테스트 실패 확인**

```bash
pnpm test components/messages/__tests__/format.test.ts
```
Expected: FAIL — `formatListTime is not a function`

- [ ] **2.3 formatListTime 구현**

`components/messages/format.ts`에 추가:

```ts
/**
 * 대화 목록 타임스탬프 — 오늘=시각, 어제="어제", 7일 이내=요일명, 그 이전=M/D.
 * @param now — 테스트 주입용 기준 시각 (기본값: 현재)
 */
export function formatListTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const todayUtcMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dUtcMid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((todayUtcMid - dUtcMid) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return formatTime(iso);
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return d.toLocaleDateString('ko-KR', { weekday: 'long' }); // "월요일"
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
```

- [ ] **2.4 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/format.test.ts
```
Expected: PASS (기존 2 + 신규 4 = 6 green)

- [ ] **2.5 커밋**

```bash
git add components/messages/format.ts components/messages/__tests__/format.test.ts
git commit -m "feat(messages): add formatListTime for relative time display in conversation list"
```

---

## Task 3: ConversationListItem RFP 필드 enrichment

**Files:**
- Modify: `lib/server/actions/chat/conversationLoaders.ts`
- Modify: `lib/server/actions/chat/__tests__/inboxLoader.test.ts`

- [ ] **3.1 실패 테스트 작성**

`lib/server/actions/chat/__tests__/inboxLoader.test.ts` 안의 기존 `listInboxForViewer` describe 블록에 아래 테스트를 추가한다:

```ts
it('counterparty 항목에 마지막 메시지의 RFP code/title/status/deadline을 포함한다', async () => {
  const buyerUser = await seedUser(db, { email: 'buyer2@b.com', name: '구매' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'PG사');
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });

  sessionRef.value = {
    user: { id: buyerUser.id, email: buyerUser.email, workspaceId: buyerWs.id, workspaceType: 'buyer' },
  };

  // rfpId 를 포함한 메시지 전송
  await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: '안녕', rfpId: rfp.id });

  const items = await listInboxForViewer();
  const counterpartyItem = items.find((i) => i.kind === 'counterparty');
  expect(counterpartyItem).toBeDefined();
  expect(counterpartyItem!.rfpCode).toBeTruthy();
  expect(counterpartyItem!.rfpTitle).toBeTruthy();
  expect(counterpartyItem!.rfpStatus).toBeTruthy();
  expect(counterpartyItem!.rfpDeadline).toBeTruthy();
});

it('마지막 메시지에 rfpId가 없으면 rfpCode 등이 null이다', async () => {
  const buyerUser = await seedUser(db, { email: 'buyer3@b.com', name: '구매2' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'PG사2');

  sessionRef.value = {
    user: { id: buyerUser.id, email: buyerUser.email, workspaceId: buyerWs.id, workspaceType: 'buyer' },
  };

  await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: '안녕', rfpId: undefined });

  const items = await listInboxForViewer();
  const counterpartyItem = items.find((i) => i.kind === 'counterparty');
  expect(counterpartyItem).toBeDefined();
  expect(counterpartyItem!.rfpCode).toBeNull();
  expect(counterpartyItem!.rfpTitle).toBeNull();
});
```

- [ ] **3.2 테스트 실패 확인**

```bash
pnpm test lib/server/actions/chat/__tests__/inboxLoader.test.ts
```
Expected: FAIL — `rfpCode` not in type / undefined

- [ ] **3.3 ConversationListItem 타입 확장**

`lib/server/actions/chat/conversationLoaders.ts`:

```ts
export type ConversationListItem = {
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: WorkspaceType; hasLogo: boolean };
  rfpId: string | null;
  rfpCode: string | null;
  rfpTitle: string | null;
  rfpStatus: string | null;
  rfpDeadline: string | null;
  preview: string;
  lastMessageAt: string | null;
  unread: boolean;
};
```

- [ ] **3.4 listConversationsForViewer에 RFP lookup 추가**

`listConversationsForViewer` 함수 안, `conversations.map(async (conv) => {` 블록 내에서:

```ts
// 기존
const rfpRepo = await getRfpRepo();  // 이미 import되어 있음; 없으면 getXxx() 호출 추가

// 기존 parallel await 이후에 rfpId 파생 후 rfp 조회:
const [counterpartyWs, msgs, myRead] = await Promise.all([
  wsRepo.findById(counterpartyWsId),
  msgRepo.listByConversation(conv.id),
  readRepo.getFor(conv.id, ws.userId),
]);
const last = msgs[msgs.length - 1];
const rfpId = last?.rfpId ?? null;
const rfp = rfpId ? await rfpRepo.findById(rfpId) : undefined;

// return 블록 수정:
return {
  conversationId: conv.id,
  counterparty: { ... },
  rfpId,
  rfpCode: rfp?.code ?? null,
  rfpTitle: rfp?.title ?? null,
  rfpStatus: rfp?.status ?? null,
  rfpDeadline: rfp ? new Date(rfp.deadline).toISOString() : null,
  preview: last?.body ?? '',
  lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
  unread,
} satisfies ConversationListItem;
```

`getRfpRepo`가 이미 import되어 있는지 확인; 없으면 상단 import에 추가:
```ts
import { ..., getRfpRepo } from '@/lib/server/repositories/factory';
```

- [ ] **3.5 테스트 통과 확인**

```bash
pnpm test lib/server/actions/chat/__tests__/inboxLoader.test.ts
```
Expected: 기존 테스트 포함 전체 PASS

- [ ] **3.6 커밋**

```bash
git add lib/server/actions/chat/conversationLoaders.ts lib/server/actions/chat/__tests__/inboxLoader.test.ts
git commit -m "feat(chat): enrich ConversationListItem with rfp code/title/status/deadline"
```

---

## Task 4: ConversationList — 검색 인풋 + RFP 칩 + 시간 포맷 개선

**Files:**
- Modify: `components/messages/ConversationList.tsx`
- Modify: `components/messages/__tests__/ConversationList.test.tsx`
- Modify: `components/messages/MessageInbox.tsx` (search 상태 + visible 필터 변경)

### 4a. MessageInbox에 search 상태 추가

- [ ] **4a.1 실패 테스트 (MessageInbox 검색)**

`components/messages/__tests__/MessageInbox.test.tsx`에 추가:

```ts
it('검색어 입력 시 이름 기준으로 대화 목록을 필터링한다', async () => {
  const user = userEvent.setup();
  const mixed: InboxListItem[] = [
    {
      kind: 'counterparty', key: 'c:c1',
      conversationId: 'c1',
      counterparty: { workspaceId: 'w1', name: '토스페이', type: 'pg', hasLogo: false },
      rfpId: null, rfpCode: null, rfpTitle: null, rfpStatus: null, rfpDeadline: null,
      preview: '안녕하세요', lastMessageAt: null, unread: false,
    },
    {
      kind: 'team', key: 't:r1', rfpId: 'r1',
      rfpCode: 'P-2605-0001', rfpTitle: '결제 서비스',
      preview: '내부 메모', lastMessageAt: null, unread: false,
    },
  ];
  render(<MessageInbox items={mixed} />);
  await user.type(screen.getByPlaceholderText('대화 검색'), '토스');
  expect(screen.getByRole('button', { name: /토스페이/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /결제 서비스/ })).not.toBeInTheDocument();
});
```

- [ ] **4a.2 테스트 실패 확인**

```bash
pnpm test components/messages/__tests__/MessageInbox.test.tsx
```
Expected: FAIL — 검색 인풋이 없음

- [ ] **4a.3 MessageInbox 검색 상태 + 필터 로직 추가**

`components/messages/MessageInbox.tsx`:

```tsx
// 1. import 추가
import { formatListTime } from './format'; // 필요 없음 (MessageInbox에선 사용 안함)

// 2. 컴포넌트 내부 상태 추가
const [search, setSearch] = useState('');

// 3. visible 필터 수정 (기존 filter 로직 뒤에 search 필터 추가)
const visible = items
  .filter((i) => filter === 'all' || i.kind === filter)
  .filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (i.kind === 'team') {
      return (
        i.rfpCode.toLowerCase().includes(q) ||
        i.rfpTitle.toLowerCase().includes(q) ||
        i.preview.toLowerCase().includes(q)
      );
    }
    return (
      i.counterparty.name.toLowerCase().includes(q) ||
      (i.rfpCode?.toLowerCase() ?? '').includes(q) ||
      i.preview.toLowerCase().includes(q)
    );
  });

// 4. 목록 패널 헤더 교체: "대화" 레이블 → 검색 인풋
// 기존:
// <span className="text-[12px] font-medium ...">대화</span>
// <NewConversationSheet />
// 변경:
<input
  type="search"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="대화 검색"
  className="flex-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2.5 py-1 text-[12px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
  aria-label="대화 검색"
/>
<NewConversationSheet />
```

- [ ] **4a.4 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/MessageInbox.test.tsx
```
Expected: 새 테스트 포함 모두 PASS

### 4b. ConversationList RFP 칩 + 시간 포맷

- [ ] **4b.1 실패 테스트 (ConversationList)**

`components/messages/__tests__/ConversationList.test.tsx`에 추가:

```ts
it('counterparty 항목에 rfpCode가 있으면 RFP 칩을 표시한다', () => {
  render(
    <ConversationList
      items={[makeCounterparty({ rfpCode: 'P-2605-0042', rfpTitle: '결제대행 견적' })]}
      selectedKey={null}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
  expect(screen.getByText('결제대행 견적')).toBeInTheDocument();
});

it('counterparty 항목에 rfpCode가 null이면 RFP 칩을 숨긴다', () => {
  render(
    <ConversationList
      items={[makeCounterparty({ rfpCode: null, rfpTitle: null })]}
      selectedKey={null}
      onSelect={vi.fn()}
    />,
  );
  // no rfp chip rendered
  expect(screen.queryByText(/P-\d/)).not.toBeInTheDocument();
});

it('lastMessageAt이 오늘이면 시각(오전/오후 형식)을 표시한다', () => {
  // formatListTime(today) → formatTime(iso) → 오전/오후 H:mm
  const todayIso = new Date().toISOString();
  render(
    <ConversationList
      items={[makeCounterparty({ lastMessageAt: todayIso })]}
      selectedKey={null}
      onSelect={vi.fn()}
    />,
  );
  // 시각 표시 — 오전/오후 패턴
  expect(screen.getByText(/^오[전후] \d{1,2}:\d{2}$/)).toBeInTheDocument();
});
```

`makeCounterparty` 픽스처에 새 필드 추가 (타입 확장 반영):

```ts
function makeCounterparty(over: Partial<Extract<InboxListItem, { kind: 'counterparty' }>> = {}): InboxListItem {
  return {
    kind: 'counterparty',
    key: 'c:conv-1',
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg', hasLogo: false },
    rfpId: null,
    rfpCode: null,       // 신규 기본값
    rfpTitle: null,      // 신규
    rfpStatus: null,     // 신규
    rfpDeadline: null,   // 신규
    preview: '제안 보냅니다.',
    lastMessageAt: '2026-06-02T01:00:00.000Z',
    unread: false,
    ...over,
  };
}
```

- [ ] **4b.2 테스트 실패 확인**

```bash
pnpm test components/messages/__tests__/ConversationList.test.tsx
```
Expected: FAIL — 새 필드 타입 오류 + RFP 칩 없음

- [ ] **4b.3 ConversationList 구현 수정**

`components/messages/ConversationList.tsx`:

1. `formatLastMessageTime` 함수를 `formatListTime` import로 교체:

```ts
import { formatListTime } from './format';
// formatLastMessageTime 함수 삭제
```

2. 목록 항목 내 이름 행 아래에 RFP 칩 행 추가 (team과 counterparty 모두):

```tsx
{/* RFP 칩 — counterparty는 rfpCode 있을 때만, team은 항상 */}
{(item.kind === 'team' || item.rfpCode) && (
  <div className="mt-0.5 flex items-center gap-1.5">
    <span className="md-numeric shrink-0 rounded-[3px] bg-[var(--md-sys-color-primary-container)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--md-sys-color-on-primary-container)]">
      {item.kind === 'team' ? item.rfpCode : item.rfpCode}
    </span>
    <span className="truncate text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
      {item.kind === 'team' ? item.rfpTitle : item.rfpTitle}
    </span>
  </div>
)}
```

3. 시간 포맷 교체: `formatLastMessageTime(item.lastMessageAt)` → `formatListTime(item.lastMessageAt)`:

```tsx
{item.lastMessageAt && (
  <time dateTime={item.lastMessageAt} className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
    {formatListTime(item.lastMessageAt)}
  </time>
)}
```

4. 기존 team 이름 행(`팀 · rfpCode rfpTitle` 단일 스팬)을 단순화:

```tsx
{item.kind === 'team' ? (
  <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
    팀 내부
  </span>
) : (
  <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
    {item.counterparty.name}
  </span>
)}
```

- [ ] **4b.4 기존 팀 스레드 이름 테스트 업데이트**

기존 테스트 `'renders a team thread row with 팀 label, rfp code and title'`는 이름이 `팀 내부`로 변경됨에 따라 수정:

```ts
it('팀 스레드 항목에 rfpCode 칩과 미리보기를 렌더한다', () => {
  render(
    <ConversationList items={[makeTeam()]} selectedKey={null} onSelect={vi.fn()} />,
  );
  expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
  expect(screen.getByText(/결제대행 견적/)).toBeInTheDocument();
  expect(screen.getByText('내부 메모입니다.')).toBeInTheDocument();
});
```

기존 `screen.getByRole('button', { name: /결제대행 견적/ })`이 사용된 테스트는 rfpTitle이 여전히 버튼 내부에 있으므로 통과 유지.

- [ ] **4b.5 기존 시간 포맷 테스트 업데이트**

기존 `'shows the last message time in Seoul time (absolute, tz-stable)'` 테스트는 `toLocaleTimeString` 모킹을 사용하는데, `formatListTime`으로 교체 후 오늘 날짜 기준 `formatTime`으로 위임하게 됨. 이 테스트는 `lastMessageAt`이 `'2026-06-02T01:00:00.000Z'`(과거)이므로 `formatListTime`이 오전/오후 대신 `M/D` 또는 요일을 반환한다. 테스트를 다음으로 교체:

```ts
it('오늘이 아닌 메시지는 날짜/요일을 표시하고 toLocaleTimeString을 호출하지 않는다', () => {
  const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString');
  render(
    <ConversationList
      items={[makeCounterparty({ lastMessageAt: '2026-01-15T06:00:00.000Z' })]}
      selectedKey={null}
      onSelect={vi.fn()}
    />,
  );
  // 절대 시각이 아닌 날짜(1/15) 표시
  expect(screen.getByText('1/15')).toBeInTheDocument();
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
```

- [ ] **4b.6 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/ConversationList.test.tsx
```
Expected: 전체 PASS

- [ ] **4b.7 커밋**

```bash
git add components/messages/ConversationList.tsx components/messages/__tests__/ConversationList.test.tsx components/messages/MessageInbox.tsx components/messages/__tests__/MessageInbox.test.tsx
git commit -m "feat(messages): add search, RFP chip, and relative time to conversation list"
```

---

## Task 5: ContextPanel 신규 컴포넌트

**Files:**
- Create: `components/messages/ContextPanel.tsx`
- Create: `components/messages/__tests__/ContextPanel.test.tsx`

- [ ] **5.1 실패 테스트 작성**

`components/messages/__tests__/ContextPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// AttachmentGalleryPanel은 listConversationAttachments(server action) 의존 — mock
vi.mock('@/lib/server/actions/chat/listConversationAttachments', () => ({
  listConversationAttachments: vi.fn().mockResolvedValue([]),
}));

import { ContextPanel } from '../ContextPanel';

describe('ContextPanel', () => {
  it('rfpContext 없으면 RFP 섹션을 렌더하지 않는다', () => {
    render(<ContextPanel conversationId="conv-1" />);
    expect(screen.queryByText('연결된 RFP')).not.toBeInTheDocument();
    // 파일 섹션은 항상 렌더
    expect(screen.getByText('공유 파일')).toBeInTheDocument();
  });

  it('rfpContext 있으면 코드와 제목을 렌더한다', () => {
    render(
      <ContextPanel
        conversationId="conv-1"
        rfpContext={{ code: 'P-2605-0042', title: '온라인 결제 견적', status: 'sent', deadline: '2026-07-01T00:00:00.000Z' }}
      />,
    );
    expect(screen.getByText('연결된 RFP')).toBeInTheDocument();
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
    expect(screen.getByText('온라인 결제 견적')).toBeInTheDocument();
  });

  it('status가 "sent"이면 "요청 보냄" 칩을 렌더한다', () => {
    render(
      <ContextPanel
        conversationId="conv-1"
        rfpContext={{ code: 'P-2605-0042', title: '견적', status: 'sent', deadline: null }}
      />,
    );
    expect(screen.getByText('요청 보냄')).toBeInTheDocument();
  });

  it('deadline이 있으면 날짜를 렌더한다', () => {
    render(
      <ContextPanel
        conversationId="conv-1"
        rfpContext={{ code: 'P-2605-0042', title: '견적', status: 'sent', deadline: '2026-07-01T00:00:00.000Z' }}
      />,
    );
    expect(screen.getByText(/7월/)).toBeInTheDocument();
  });

  it('status와 deadline이 없어도 크래시하지 않는다', () => {
    render(
      <ContextPanel
        conversationId="conv-1"
        rfpContext={{ code: 'P-2605-0042', title: '견적' }}
      />,
    );
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
  });
});
```

- [ ] **5.2 테스트 실패 확인**

```bash
pnpm test components/messages/__tests__/ContextPanel.test.tsx
```
Expected: FAIL — `ContextPanel` not found

- [ ] **5.3 ContextPanel 구현**

`components/messages/ContextPanel.tsx`:

```tsx
'use client';

import { Chip } from '@/components/primitives/Chip';
import type { ChipColor } from '@/components/primitives/Chip';
import { AttachmentGalleryPanel } from './AttachmentGalleryPanel';

type RfpContext = {
  code: string;
  title: string;
  status?: string;
  deadline?: string | null;
};

type Props = {
  conversationId: string;
  rfpContext?: RfpContext;
};

const STATUS_LABEL: Record<string, string> = {
  draft: '임시저장',
  sent: '요청 보냄',
  closed: '마감',
  awarded: '선정 완료',
  cancelled: '취소',
};

const STATUS_COLOR: Record<string, ChipColor> = {
  draft: 'surface',
  sent: 'warning',
  closed: 'surface',
  awarded: 'tertiary',
  cancelled: 'error',
};

export function ContextPanel({ conversationId, rfpContext }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {rfpContext && (
        <section className="border-b border-[var(--md-sys-color-outline-variant)] p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
            연결된 RFP
          </p>
          <div className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] p-2.5">
            <p className="md-numeric text-[11px] text-[var(--md-sys-color-primary)]">
              {rfpContext.code}
            </p>
            <p className="mt-1 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
              {rfpContext.title}
            </p>
            {rfpContext.status && (
              <div className="mt-2">
                <Chip
                  label={STATUS_LABEL[rfpContext.status] ?? rfpContext.status}
                  color={STATUS_COLOR[rfpContext.status] ?? 'surface'}
                />
              </div>
            )}
            {rfpContext.deadline && (
              <p className="mt-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                마감{' '}
                <span className="md-numeric">
                  {new Date(rfpContext.deadline).toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </p>
            )}
          </div>
        </section>
      )}
      <section className="flex-1 p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
          공유 파일
        </p>
        <AttachmentGalleryPanel conversationId={conversationId} />
      </section>
    </div>
  );
}
```

- [ ] **5.4 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/ContextPanel.test.tsx
```
Expected: 5 green

- [ ] **5.5 커밋**

```bash
git add components/messages/ContextPanel.tsx components/messages/__tests__/ContextPanel.test.tsx
git commit -m "feat(messages): add ContextPanel with RFP card and shared files"
```

---

## Task 6: ThreadView — tabs variant + rfpContext + 갤러리 버튼 제거(page)

**Files:**
- Modify: `components/messages/ThreadView.tsx`
- Modify: `components/messages/__tests__/ThreadView.test.tsx`

- [ ] **6.1 실패 테스트 추가**

`components/messages/__tests__/ThreadView.test.tsx`에 추가 (기존 mocks 아래, import 위에):

```ts
// ContextPanel은 AttachmentGalleryPanel을 마운트하므로 mock
vi.mock('../ContextPanel', () => ({
  ContextPanel: ({ rfpContext }: { rfpContext?: { title?: string } }) => (
    <div data-testid="context-panel">{rfpContext?.title ?? ''}</div>
  ),
}));
```

그리고 테스트 블록에 추가:

```ts
describe('variant=tabs', () => {
  const baseProps = {
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' as const },
    viewer: { userId: 'u-self', name: '나' },
    messages: [],
    variant: 'tabs' as const,
    rfpContext: { code: 'P-2605-0042', title: '온라인 결제 견적', status: 'sent', deadline: null },
  };

  it('탭 버튼 3개(채팅·RFP·파일)를 렌더한다', () => {
    render(<ThreadView {...baseProps} />);
    expect(screen.getByRole('tab', { name: '채팅' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'RFP' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '파일' })).toBeInTheDocument();
  });

  it('기본 탭은 채팅이고 컴포저가 보인다', () => {
    render(<ThreadView {...baseProps} />);
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeInTheDocument();
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
  });

  it('RFP 탭 클릭 시 ContextPanel을 렌더하고 컴포저를 숨긴다', async () => {
    const user = userEvent.setup();
    render(<ThreadView {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: 'RFP' }));
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('메시지를 입력하세요…')).not.toBeInTheDocument();
  });

  it('파일 탭 클릭 후 채팅 탭 클릭 시 컴포저가 복원된다', async () => {
    const user = userEvent.setup();
    render(<ThreadView {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: '파일' }));
    await user.click(screen.getByRole('tab', { name: '채팅' }));
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeInTheDocument();
  });
});

describe('variant=page (갤러리 버튼 없음)', () => {
  const baseProps = {
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' as const },
    viewer: { userId: 'u-self', name: '나' },
    messages: [
      {
        id: 'm1', authorUserId: 'u-pg', authorName: 'PG', authorEmail: 'p@pg.com',
        sender: 'other' as const, body: '파일 보냅니다', rfpId: null,
        createdAt: new Date().toISOString(), readByCounterparty: false,
        attachments: [{ id: 'a1', name: 'test.pdf', size: 100, mimeType: 'application/pdf', url: '/api/files/a1' }],
      },
    ],
    variant: 'page' as const,
  };

  it('page variant에서는 "파일 N" 토글 버튼이 없다', () => {
    render(<ThreadView {...baseProps} />);
    expect(screen.queryByText(/파일 \d/)).not.toBeInTheDocument();
  });
});
```

- [ ] **6.2 테스트 실패 확인**

```bash
pnpm test components/messages/__tests__/ThreadView.test.tsx --reporter=verbose 2>&1 | tail -30
```
Expected: 새 테스트들 FAIL

- [ ] **6.3 ThreadView 수정**

`components/messages/ThreadView.tsx`에서:

**a) Props 타입 수정:**
```ts
type Props = {
  ...
  variant?: 'page' | 'rail' | 'tabs';
  rfpContext?: { code: string; title: string; status?: string; deadline?: string | null };
};
```

**b) `activeTab` 상태 추가:**
```ts
const [activeTab, setActiveTab] = useState<'chat' | 'rfp' | 'files'>('chat');
// variant가 변경되면 탭 리셋
useEffect(() => { setActiveTab('chat'); }, [variant]);
```

**c) `ContextPanel` import 추가:**
```ts
import { ContextPanel } from './ContextPanel';
```

**d) 갤러리 토글 버튼 조건 변경** — `totalAttachmentCount` 버튼을 `variant === 'rail'`에서만 렌더:
```tsx
// 기존: {totalAttachmentCount > 0 && <button ... />}
// 변경:
{variant === 'rail' && totalAttachmentCount > 0 && (
  <button ...>
    <PaperclipIcon size={13} />
    <span className="md-numeric">파일 {totalAttachmentCount}</span>
  </button>
)}
```

**e) 탭 버튼 추가** — 헤더 영역 끝에:
```tsx
{variant === 'tabs' && (
  <div role="tablist" className="ml-auto flex items-center gap-0.5">
    {(['chat', 'rfp', 'files'] as const).map((tab) => (
      <button
        key={tab}
        role="tab"
        type="button"
        aria-selected={activeTab === tab}
        onClick={() => setActiveTab(tab)}
        className={cn(
          'rounded-[var(--md-sys-shape-small)] px-2.5 py-1 text-[11px] transition-colors',
          activeTab === tab
            ? 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]'
            : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-low)]',
        )}
      >
        {tab === 'chat' ? '채팅' : tab === 'rfp' ? 'RFP' : '파일'}
      </button>
    ))}
  </div>
)}
```

**f) 메시지 목록 + 컴포저를 탭 조건으로 감싸기:**

기존 메시지 목록(`<div className="relative flex-1 overflow-hidden">...`)과 컴포저 div를 아래 구조로 감싼다:

```tsx
{/* 채팅 탭 or non-tabs variant */}
{(variant !== 'tabs' || activeTab === 'chat') && (
  <>
    {/* 기존 메시지 목록 전체 */}
    <div className="relative flex-1 overflow-hidden">
      ...
    </div>
    {/* 연결 끊김 배너 */}
    {/* 첨부 칩 리스트 */}
    {/* sendDisabled 안내 */}
    {/* 컴포저 */}
  </>
)}

{/* RFP 탭 */}
{variant === 'tabs' && activeTab === 'rfp' && (
  <div className="flex-1 overflow-y-auto">
    <ContextPanel conversationId={conversationId} rfpContext={rfpContext} />
  </div>
)}

{/* 파일 탭 */}
{variant === 'tabs' && activeTab === 'files' && (
  <div className="flex-1 overflow-y-auto p-3">
    <AttachmentGalleryPanel conversationId={conversationId} />
  </div>
)}
```

**g) 갤러리 사이드 패널 조건 변경** — `page` variant에서 갤러리 패널 제거:
```tsx
// 기존: {variant === 'page' && showGallery && (...)}
// 변경: 완전 제거 (page variant는 MessageInbox의 ContextPanel이 담당)
// rail variant overlay는 유지:
{variant === 'rail' && showGallery && (
  <div data-gallery-overlay ...>
    <AttachmentGalleryPanel conversationId={conversationId} />
  </div>
)}
```

- [ ] **6.4 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/ThreadView.test.tsx
```
Expected: 기존 + 신규 전체 PASS

- [ ] **6.5 커밋**

```bash
git add components/messages/ThreadView.tsx components/messages/__tests__/ThreadView.test.tsx
git commit -m "feat(messages): add tabs variant to ThreadView and remove gallery toggle from page variant"
```

---

## Task 7: ThreadPane — rfpContext prop 관통

**Files:**
- Modify: `components/messages/ThreadPane.tsx`

- [ ] **7.1 ThreadPane에 rfpContext prop 추가**

`components/messages/ThreadPane.tsx`:

```tsx
export function ThreadPane({
  conversationId,
  counterpartyFallback,
  onBack,
  variant,
  defaultRfpId,
  sendDisabled,
  rfpContext,           // 신규
}: {
  conversationId: string;
  counterpartyFallback: { workspaceId: string; name: string; type: 'buyer' | 'pg'; hasLogo: boolean };
  onBack?: () => void;
  variant?: 'page' | 'rail' | 'tabs';
  defaultRfpId?: string;
  sendDisabled?: boolean;
  rfpContext?: { code: string; title: string; status?: string; deadline?: string | null }; // 신규
}) {
  const result = use(getThreadPromise(conversationId));
  const counterparty = result.ok ? result.counterparty : counterpartyFallback;
  const messages = result.ok ? result.messages : [];
  const viewer = result.ok ? result.viewer : { userId: '', name: '' };
  const rfpById = result.ok ? result.rfpById : undefined;
  return (
    <ThreadView
      key={conversationId}
      conversationId={conversationId}
      counterparty={counterparty}
      viewer={viewer}
      messages={messages}
      onBack={onBack}
      variant={variant}
      defaultRfpId={defaultRfpId}
      rfpById={rfpById}
      sendDisabled={sendDisabled}
      rfpContext={rfpContext}    // 신규
    />
  );
}
```

- [ ] **7.2 기존 전체 테스트 통과 확인**

```bash
pnpm test components/messages
```
Expected: 전체 PASS (회귀 없음)

- [ ] **7.3 커밋**

```bash
git add components/messages/ThreadPane.tsx
git commit -m "feat(messages): pass rfpContext through ThreadPane to ThreadView"
```

---

## Task 8: MessageInbox — 3-컬럼 레이아웃 + xl 컨텍스트 패널

**Files:**
- Modify: `components/messages/MessageInbox.tsx`
- Modify: `components/messages/__tests__/MessageInbox.test.tsx`

- [ ] **8.1 실패 테스트 추가**

`components/messages/__tests__/MessageInbox.test.tsx` 상단 mock 영역에 추가:

```ts
// ContextPanel mock (xl 패널 테스트용)
vi.mock('../ContextPanel', () => ({
  ContextPanel: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="context-panel" data-conversation={conversationId} />
  ),
}));

// useIsXlUp mock — 기본값 false (xl 아님)
const mockXlUp = { value: false };
vi.mock('@/hooks/use-xl-up', () => ({
  useIsXlUp: () => mockXlUp.value,
}));
```

그리고 테스트 블록에 추가:

```ts
describe('xl 컨텍스트 패널', () => {
  beforeEach(() => { mockXlUp.value = true; });
  afterEach(() => { mockXlUp.value = false; });

  it('xl에서 대화 선택 시 ContextPanel을 렌더한다', async () => {
    const user = userEvent.setup();
    loadConversationThread.mockResolvedValue({
      ok: true, conversationId: 'conv-1',
      counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' },
      viewer: { userId: 'u-self', name: '나' },
      messages: [],
    });
    render(<MessageInbox items={items} />);
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /OO페이/ }));
    });
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();
  });

  it('xl에서 대화 미선택 시 ContextPanel을 렌더하지 않는다', () => {
    render(<MessageInbox items={items} />);
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
  });
});
```

- [ ] **8.2 테스트 실패 확인**

```bash
pnpm test components/messages/__tests__/MessageInbox.test.tsx
```
Expected: 새 xl 테스트 FAIL

- [ ] **8.3 MessageInbox 3-컬럼 레이아웃 구현**

`components/messages/MessageInbox.tsx` 전체 구조 수정:

```tsx
'use client';

import { Suspense, useState } from 'react';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/primitives/Tabs';
import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';
import { useIsXlUp } from '@/hooks/use-xl-up';
import { ConversationList } from './ConversationList';
import { NewConversationSheet } from './NewConversationSheet';
import { ThreadPane } from './ThreadPane';
import { TeamThreadPane } from './TeamThreadPane';
import { ThreadSkeleton } from './ThreadSkeleton';
import { ContextPanel } from './ContextPanel';
import type { InboxListItem } from './types';

type Filter = 'all' | 'counterparty' | 'team';

type Props = {
  items: InboxListItem[];
  initialSelectedKey?: string | null;
  className?: string;
};

const FILTER_TABS = [
  { id: 'all', label: '전체' },
  { id: 'counterparty', label: '상대방' },
  { id: 'team', label: '팀' },
];

export function MessageInbox({ items, initialSelectedKey = null, className }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(initialSelectedKey);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const isXl = useIsXlUp();

  const visible = items
    .filter((i) => filter === 'all' || i.kind === filter)
    .filter((i) => {
      if (!search) return true;
      const q = search.toLowerCase();
      if (i.kind === 'team') {
        return (
          i.rfpCode.toLowerCase().includes(q) ||
          i.rfpTitle.toLowerCase().includes(q) ||
          i.preview.toLowerCase().includes(q)
        );
      }
      return (
        i.counterparty.name.toLowerCase().includes(q) ||
        (i.rfpCode?.toLowerCase() ?? '').includes(q) ||
        i.preview.toLowerCase().includes(q)
      );
    });

  const selected = items.find((i) => i.key === selectedKey) ?? null;

  const rfpContext =
    selected?.kind === 'counterparty' && selected.rfpCode
      ? {
          code: selected.rfpCode,
          title: selected.rfpTitle ?? '',
          status: selected.rfpStatus ?? undefined,
          deadline: selected.rfpDeadline,
        }
      : selected?.kind === 'team'
        ? { code: selected.rfpCode, title: selected.rfpTitle }
        : undefined;

  return (
    <div className={cn('flex min-h-0 flex-1', className)}>
      {/* 왼쪽: 대화 목록 */}
      <div
        data-pane="list"
        className={cn(
          'shrink-0 flex-col border-r border-[var(--md-sys-color-outline-variant)] md:w-64 md:flex',
          selected ? 'hidden' : 'flex w-full',
        )}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="대화 검색"
            aria-label="대화 검색"
            className="flex-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2.5 py-1 text-[12px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
          />
          <NewConversationSheet />
        </div>
        <Tabs tabs={FILTER_TABS} active={filter} onChange={(id) => setFilter(id as Filter)} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList items={visible} selectedKey={selectedKey} onSelect={setSelectedKey} />
        </div>
      </div>

      {/* 중앙: 스레드 */}
      <div
        data-pane="thread"
        className={cn('flex min-h-0 min-w-0 flex-1 flex-col md:flex', selected ? 'flex' : 'hidden')}
      >
        {selected?.kind === 'team' ? (
          <TeamThreadPane rfpId={selected.rfpId} onBack={() => setSelectedKey(null)} />
        ) : selected?.kind === 'counterparty' ? (
          <Suspense key={selected.key} fallback={<ThreadSkeleton />}>
            <ThreadPane
              conversationId={selected.conversationId}
              counterpartyFallback={selected.counterparty}
              rfpContext={rfpContext}
              variant={isXl ? 'page' : 'tabs'}
              onBack={() => setSelectedKey(null)}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<EnvelopeIcon />}
              title="대화를 선택하세요"
              description="좌측 목록에서 대화를 열어 메시지를 확인하세요."
            />
          </div>
        )}
      </div>

      {/* 오른쪽: 컨텍스트 패널 (xl 이상, 대화 선택 시에만) */}
      {isXl && selected && (
        <div
          data-pane="context"
          className="hidden w-64 shrink-0 flex-col border-l border-[var(--md-sys-color-outline-variant)] xl:flex"
        >
          <div className="flex h-[44px] shrink-0 items-center border-b border-[var(--md-sys-color-outline-variant)] px-3 text-[11px] font-medium uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
            컨텍스트
          </div>
          {selected.kind === 'counterparty' && (
            <ContextPanel conversationId={selected.conversationId} rfpContext={rfpContext} />
          )}
          {selected.kind === 'team' && (
            <ContextPanel conversationId={selected.rfpId} rfpContext={rfpContext} />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **8.4 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/MessageInbox.test.tsx
```
Expected: 전체 PASS (기존 + 신규)

- [ ] **8.5 전체 테스트 그린 확인**

```bash
pnpm test components/messages
```
Expected: 전체 PASS

- [ ] **8.6 커밋**

```bash
git add components/messages/MessageInbox.tsx components/messages/__tests__/MessageInbox.test.tsx
git commit -m "feat(messages): 3-column layout with xl context panel and search"
```

---

## Task 9: 전체 스위트 + tsc + lint 검증

- [ ] **9.1 전체 유닛 테스트 그린 확인**

```bash
pnpm test
```
Expected: 전체 PASS (기존 대비 회귀 없음)

- [ ] **9.2 TypeScript 타입 오류 없음 확인**

```bash
pnpm tsc --noEmit
```
Expected: 오류 0건

- [ ] **9.3 Lint 오류 없음 확인**

```bash
pnpm lint
```
Expected: 오류 0건

- [ ] **9.4 최종 커밋**

```bash
git commit --allow-empty -m "chore: messages UI redesign complete — 3-column layout, search, RFP chip, context panel"
```

---

## 주의사항 (트랩)

1. **`ConversationListItem` 타입 변경으로 인한 픽스처 갱신 필요**: `ConversationList.test.tsx`의 `makeCounterparty` 픽스처에 `rfpCode/rfpTitle/rfpStatus/rfpDeadline: null` 추가 필요 (Task 4b.1에 포함됨).

2. **`getRfpRepo` import**: `conversationLoaders.ts`에 `getRfpRepo`가 이미 import되어 있는지 확인; 없으면 `@/lib/server/repositories/factory`에서 추가.

3. **`useIsXlUp` mock**: MessageInbox 테스트에서 hook을 mock하지 않으면 jsdom 환경(window.innerWidth=0)에서 항상 false를 반환 — mock 없어도 기존 테스트는 통과하지만, xl 패널 테스트는 mock 필요.

4. **`variant='page'` 갤러리 제거**: 기존 ThreadView 테스트 중 `page` variant에서 갤러리 toggle을 assert하는 테스트가 있으면 제거 또는 수정. `rail` variant 테스트는 유지.

5. **`팀 내부` 이름 변경**: 기존 ConversationList 테스트 중 `팀 · P-2605-0042` 패턴을 찾는 테스트가 있으면 Task 4b.4 수정사항으로 처리됨.
