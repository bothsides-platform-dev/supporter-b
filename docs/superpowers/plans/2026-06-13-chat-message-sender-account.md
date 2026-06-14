# 채팅 메시지 발신자(담당자) 표시 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** buyer↔PG 채팅 스레드의 각 메시지에 보낸 담당자(계정)의 이름·아바타를 양쪽(self·other) 모두 표시하고, 이메일은 이름 호버로 확인할 수 있게 한다.

**Architecture:** 스키마는 그대로 둔다(`chat_messages.author_user_id` FK 이미 존재). 읽기 시점에 `users`를 조인해 이름·이메일을 가져온다(팀 채팅 `rfp_team_messages.listByScope` 선례). 스레드 로더가 작성자 신원을 `ThreadMessage`에 실어 내려보내고, `ThreadView`가 메시지 묶음마다 작성자 헤더를 그린다. 라이브 전송 경로는 publish 페이로드에 작성자 신원을 추가해 리로드 없이 이름이 보이게 한다.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + Postgres(테스트는 PGlite), Vitest, `@base-ui/react`, Tailwind v4.

스펙: `docs/superpowers/specs/2026-06-13-chat-message-sender-account-design.md`

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/server/repositories/types.ts` | repo 계약 | `ChatMessageWithAuthor` 타입 추가, `ChatMessageRepo`에 메서드 추가 |
| `lib/server/repositories/drizzle/chat-message.ts` | 메시지 Drizzle repo | `listByConversationWithAuthor`(users 조인) 추가 |
| `lib/server/repositories/drizzle/__tests__/chat-message.test.ts` | repo 단위 테스트 | **신규** |
| `lib/server/services/chat.ts` | ChatService | `sendMessage` 결과에 `authorName`·`authorEmail` 추가 |
| `lib/server/actions/chat/sendChatMessageAction.ts` | 전송 액션 | publish 페이로드에 작성자 신원 추가 |
| `lib/server/actions/chat/__tests__/sendChatMessage.test.ts` | 액션 테스트 | publish 작성자 신원 검증 추가 |
| `lib/server/actions/chat/conversationLoaders.ts` | 스레드 로더 | `ThreadMessage` 확장, 조인 메서드 사용, `viewer` 반환 |
| `lib/server/actions/chat/__tests__/conversationLoaders.test.ts` | 로더 테스트 | 작성자 신원·viewer 검증 추가 |
| `components/messages/ThreadView.tsx` | 스레드 UI | `viewer` prop, 작성자 헤더(양쪽), 작성자별 그룹핑, 이메일 호버, 라이브/낙관적 작성자 필드 |
| `components/messages/__tests__/ThreadView.test.tsx` | 컴포넌트 테스트 | 픽스처 확장 + 작성자 표시 동작 테스트 |
| `components/messages/ThreadPane.tsx` | 로더→뷰 와이어 | `viewer` 전달 |
| `components/messages/__tests__/MessageInbox.test.tsx` | 인박스 테스트 | 로더 mock 에 `viewer`+작성자 필드 추가(실 ThreadView 마운트) |

의존 순서: Task 1(repo) → Task 2(send) → Task 3(loader+타입+plumbing) → Task 4(UI 렌더) → Task 5(health gate). 각 커밋은 프로덕션 코드가 컴파일되고 해당 테스트가 green인 상태로 끝난다.

**RED/GREEN 확인은 항상 단일 파일** `pnpm test <path>` 로. 워크트리에서 실행하며, `node_modules`는 메인 저장소로 심링크돼 있다.

---

## Task 1: 리포지토리 — `listByConversationWithAuthor`

**Files:**
- Modify: `lib/server/repositories/types.ts:475-494`
- Modify: `lib/server/repositories/drizzle/chat-message.ts`
- Test: `lib/server/repositories/drizzle/__tests__/chat-message.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/server/repositories/drizzle/__tests__/chat-message.test.ts`:

```ts
// DrizzleChatMessageRepository.listByConversationWithAuthor — pglite-backed.
// Joins users to surface the author's current name/email per message (the
// team-chat listByScope precedent). Keeps created_at asc.
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleChatConversationRepository } from '../chat-conversation';
import { DrizzleChatMessageRepository } from '../chat-message';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const convRepo = new DrizzleChatConversationRepository(db);
  const msgRepo = new DrizzleChatMessageRepository(db);
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  const pgWs = await seedPgWorkspace(db, 'PG', { name: 'OO페이' });
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '구매사담당' });
  const pgUser = await seedUser(db, { email: 'sales@pg.com', name: 'PG영업' });
  return { db, convRepo, msgRepo, buyerWs, pgWs, buyerUser, pgUser };
}

describe('DrizzleChatMessageRepository.listByConversationWithAuthor', () => {
  it('returns each message with the author name/email joined, created_at asc', async () => {
    const { convRepo, msgRepo, buyerWs, pgWs, buyerUser, pgUser } = await setup();
    const conv = await convRepo.findOrCreatePair(buyerWs.id, pgWs.id);

    await msgRepo.save({
      id: 'm-1',
      conversationId: conv.id,
      authorUserId: buyerUser.id,
      authorWsId: buyerWs.id,
      body: 'buyer first',
      rfpId: null,
      createdAt: new Date('2026-05-26T05:00:00.000Z'),
    });
    await msgRepo.save({
      id: 'm-2',
      conversationId: conv.id,
      authorUserId: pgUser.id,
      authorWsId: pgWs.id,
      body: 'pg reply',
      rfpId: null,
      createdAt: new Date('2026-05-26T05:01:00.000Z'),
    });

    const rows = await msgRepo.listByConversationWithAuthor(conv.id);

    expect(rows.map((r) => r.body)).toEqual(['buyer first', 'pg reply']);
    expect(rows.map((r) => r.authorName)).toEqual(['구매사담당', 'PG영업']);
    expect(rows.map((r) => r.authorEmail)).toEqual(['buyer@b.com', 'sales@pg.com']);
    expect(rows.map((r) => r.authorUserId)).toEqual([buyerUser.id, pgUser.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/chat-message.test.ts`
Expected: FAIL — `msgRepo.listByConversationWithAuthor is not a function` (method 미존재).

- [ ] **Step 3: Add the type in `lib/server/repositories/types.ts`**

Replace the `ChatMessageRepo` block (lines 486-494) with:

```ts
export type ChatMessageWithAuthor = ChatMessageRecord & {
  authorName: string;
  authorEmail: string;
};

export interface ChatMessageRepo {
  /** 메시지 insert. 첨부 링크는 액션 레이어 책임. */
  save(msg: ChatMessageRecord, tx?: Tx): Promise<void>;
  /** 한 대화의 모든 메시지 — created_at asc. */
  listByConversation(
    conversationId: string,
    tx?: Tx,
  ): Promise<ChatMessageRecord[]>;
  /**
   * 한 대화의 모든 메시지 + 작성자 이름·이메일(users 조인) — created_at asc.
   * 스레드 로더 전용. 인박스 목록 로더는 가벼운 listByConversation 을 쓴다.
   */
  listByConversationWithAuthor(
    conversationId: string,
    tx?: Tx,
  ): Promise<ChatMessageWithAuthor[]>;
}
```

- [ ] **Step 4: Implement the method in `lib/server/repositories/drizzle/chat-message.ts`**

Change the import line (top of file) from:

```ts
import { asc, eq } from 'drizzle-orm';
import { chatMessages } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { ChatMessageRecord, ChatMessageRepo, Tx } from '../types';
```

to:

```ts
import { asc, eq } from 'drizzle-orm';
import { chatMessages, users } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type {
  ChatMessageRecord,
  ChatMessageRepo,
  ChatMessageWithAuthor,
  Tx,
} from '../types';
```

Then add this method right after `listByConversation` (after its closing `}`, before the class's closing brace):

```ts
  async listByConversationWithAuthor(
    conversationId: string,
    tx?: Tx,
  ): Promise<ChatMessageWithAuthor[]> {
    const db = this.h(tx);
    return (await db
      .select({
        ...MESSAGE_COLUMNS,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(chatMessages)
      .innerJoin(users, eq(users.id, chatMessages.authorUserId))
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt))) as ChatMessageWithAuthor[];
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/chat-message.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 6: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/chat-message.ts lib/server/repositories/drizzle/__tests__/chat-message.test.ts
git commit -m "feat(chat): add listByConversationWithAuthor repo method" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 전송 경로 — 작성자 신원을 라이브 페이로드에 싣기

**Files:**
- Modify: `lib/server/services/chat.ts:71-76, 136-145, 244-251`
- Modify: `lib/server/actions/chat/sendChatMessageAction.ts:67-76`
- Test: `lib/server/actions/chat/__tests__/sendChatMessage.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it(...)` inside the top-level `describe('sendChatMessageAction', ...)` block in `lib/server/actions/chat/__tests__/sendChatMessage.test.ts` (e.g. right after the existing "publishes a content-bearing live message event" test, ~line 194):

```ts
  it('publishes the author identity (userId/name/email) so receivers can label the message', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: '담당자 표시 확인',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [, payload] = publishChatEvent.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).toMatchObject({
      authorUserId: buyerUser.id,
      authorName: '구매사담당',
      authorEmail: 'buyer@b.com',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/actions/chat/__tests__/sendChatMessage.test.ts -t "publishes the author identity"`
Expected: FAIL — payload has no `authorUserId`/`authorName`/`authorEmail` (toMatchObject mismatch).

- [ ] **Step 3: Service returns the author identity — `lib/server/services/chat.ts`**

(a) Widen the method return type. Replace lines 71-76:

```ts
  async sendMessage(
    input: SendMessageInput,
    actor: ChatActor,
  ): Promise<
    ServiceResult<{ conversationId: string; messageId: string; createdAt: string }>
  > {
```

with:

```ts
  async sendMessage(
    input: SendMessageInput,
    actor: ChatActor,
  ): Promise<
    ServiceResult<{
      conversationId: string;
      messageId: string;
      createdAt: string;
      authorName: string;
      authorEmail: string;
    }>
  > {
```

(b) Resolve the sender once, before the transaction. After line 137 (`const messageId = randomUUID();`) add:

```ts
    // 표시 전용 — 보낸 사람 이름/이메일(라이브 수신자가 메시지에 라벨을 붙인다).
    const me = await this.userRepo.findById(actor.userId);
```

(c) Widen the inner transaction result type. Replace lines 140-145:

```ts
    const result: ServiceResult<{
      conversationId: string;
      messageId: string;
      createdAt: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }> = await this._db.transaction(async (tx: any) => {
```

with:

```ts
    const result: ServiceResult<{
      conversationId: string;
      messageId: string;
      createdAt: string;
      authorName: string;
      authorEmail: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }> = await this._db.transaction(async (tx: any) => {
```

(d) Add the fields to the returned object. Replace lines 244-251:

```ts
      return {
        ok: true as const,
        conversationId: conv.id,
        messageId,
        // 서버 권위 타임스탬프 — 클라이언트가 낙관적 말풍선을 확정으로 승격할 때
        // 자기 시계 대신 이 값을 채택한다(리로드 후 로더 렌더와 일치).
        createdAt: now.toISOString(),
      };
```

with:

```ts
      return {
        ok: true as const,
        conversationId: conv.id,
        messageId,
        // 서버 권위 타임스탬프 — 클라이언트가 낙관적 말풍선을 확정으로 승격할 때
        // 자기 시계 대신 이 값을 채택한다(리로드 후 로더 렌더와 일치).
        createdAt: now.toISOString(),
        authorName: me?.name ?? '',
        authorEmail: me?.email ?? '',
      };
```

- [ ] **Step 4: Action publishes the author identity — `lib/server/actions/chat/sendChatMessageAction.ts`**

Replace the `publishChatEvent` call (lines 67-76):

```ts
    await publishChatEvent(result.conversationId, {
      type: 'message',
      id: result.messageId,
      body: data.body.trim(),
      authorWsId: ws.workspaceId,
      rfpId: data.rfpId ?? null,
      // 영속 행과 동일한 서버 타임스탬프 — 라이브 수신자와 리로드 렌더가 일치.
      createdAt: result.createdAt,
      attachments: savedAtts.map(({ chatMessageId: _cid, ...att }) => att),
    });
```

with:

```ts
    await publishChatEvent(result.conversationId, {
      type: 'message',
      id: result.messageId,
      body: data.body.trim(),
      authorWsId: ws.workspaceId,
      authorUserId: ws.userId,
      authorName: result.authorName,
      authorEmail: result.authorEmail,
      rfpId: data.rfpId ?? null,
      // 영속 행과 동일한 서버 타임스탬프 — 라이브 수신자와 리로드 렌더가 일치.
      createdAt: result.createdAt,
      attachments: savedAtts.map(({ chatMessageId: _cid, ...att }) => att),
    });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/server/actions/chat/__tests__/sendChatMessage.test.ts`
Expected: PASS (전체 파일 green — 기존 테스트도 그대로 통과).

- [ ] **Step 6: Commit**

```bash
git add lib/server/services/chat.ts lib/server/actions/chat/sendChatMessageAction.ts lib/server/actions/chat/__tests__/sendChatMessage.test.ts
git commit -m "feat(chat): publish author identity on chat message events" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 로더 + `ThreadMessage` 타입 + viewer 배선 (UI 동작 변경 없음)

`ThreadMessage`에 작성자 필드를 **필수**로 추가한다. 그 결과 `ThreadView.tsx`의 메시지 객체 리터럴과 테스트 픽스처가 컴파일/런타임 정합을 위해 함께 갱신돼야 한다. 이 태스크는 **렌더 동작은 바꾸지 않는다**(헤더는 여전히 워크스페이스명) — 기존 컴포넌트 테스트는 그대로 green. 동작 변경은 Task 4.

**Files:**
- Modify: `lib/server/actions/chat/conversationLoaders.ts:23-43, 100-176`
- Modify: `components/messages/ThreadView.tsx` (Props, LiveMessagePayload, 두 객체 리터럴)
- Modify: `components/messages/ThreadPane.tsx`
- Modify: `components/messages/__tests__/ThreadView.test.tsx` (픽스처 + base())
- Test: `lib/server/actions/chat/__tests__/conversationLoaders.test.ts`

- [ ] **Step 1: Write the failing loader test**

Add this `it(...)` inside `describe('loadConversationThread', ...)` in `lib/server/actions/chat/__tests__/conversationLoaders.test.ts` (after the existing "returns messages asc..." test, ~line 160):

```ts
  it('attaches author identity to both sides and returns the viewer', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'buyer says hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    asPg(pgUser, pgWs.id);
    await sendChatMessageAction({ conversationId: sent.conversationId, body: 'pg replies' });

    asBuyer(buyerUser, buyerWs.id);
    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;

    expect(thread.messages.map((m) => m.authorUserId)).toEqual([buyerUser.id, pgUser.id]);
    expect(thread.messages.map((m) => m.authorName)).toEqual(['구매사담당', 'PG영업']);
    expect(thread.messages.map((m) => m.authorEmail)).toEqual(['buyer@b.com', 'sales@pg.com']);
    expect(thread.viewer).toEqual({ userId: buyerUser.id, name: '구매사담당' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/server/actions/chat/__tests__/conversationLoaders.test.ts -t "attaches author identity"`
Expected: FAIL — `m.authorUserId` undefined / `thread.viewer` undefined.

- [ ] **Step 3: Extend `ThreadMessage` + `LoadThreadResult` and the loader — `lib/server/actions/chat/conversationLoaders.ts`**

(a) Replace the `ThreadMessage` type (lines 23-37) — add three fields after `id`:

```ts
export type ThreadMessage = {
  id: string;
  /** 작성자 user id — 작성자별 그룹핑·낙관적 self 판별의 단일 키. */
  authorUserId: string;
  /** 작성자 표시 이름(users.name 조인) — 말풍선 그룹 헤더. */
  authorName: string;
  /** 작성자 이메일(users.email 조인) — 이름 호버로 노출. */
  authorEmail: string;
  sender: 'self' | 'other';
  body: string;
  rfpId: string | null;
  createdAt: string;
  /**
   * Read receipt for a `self` message: true when a member of the counterparty
   * workspace has a last_read_at >= this message's createdAt (i.e. the other
   * side has read it). Always false for `other` messages — the viewer's own
   * read does not count.
   */
  readByCounterparty: boolean;
  attachments: Attachment[];
};
```

(b) Replace `LoadThreadResult` (lines 39-43):

```ts
export type LoadThreadResult = ChatActionResult<{
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: WorkspaceType };
  /** 세션 사용자(클라이언트는 세션을 모른다) — 낙관적 self 말풍선이 즉시 자기
   *  이름을 그릴 때 쓴다. */
  viewer: { userId: string; name: string };
  messages: ThreadMessage[];
}>;
```

(c) Add `getUserRepo` to the factory import (line 3-9). The current import block:

```ts
import {
  getAttachmentRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
```

becomes:

```ts
import {
  getAttachmentRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
```

(d) In `loadConversationThread`, switch to the joined read and map the fields. Replace line 138:

```ts
  const rows = await msgRepo.listByConversation(conversationId);
```

with:

```ts
  const rows = await msgRepo.listByConversationWithAuthor(conversationId);
```

(e) Replace the message mapping (lines 150-164) so each message carries the author fields:

```ts
  const messages: ThreadMessage[] = rows.map((m) => {
    const isSelf = m.authorWsId === ws.workspaceId;
    return {
      id: m.id,
      authorUserId: m.authorUserId,
      authorName: m.authorName,
      authorEmail: m.authorEmail,
      sender: isSelf ? 'self' : 'other',
      body: m.body,
      rfpId: m.rfpId,
      createdAt: new Date(m.createdAt).toISOString(),
      readByCounterparty:
        isSelf &&
        counterpartyReadAt !== null &&
        counterpartyReadAt >= new Date(m.createdAt),
      attachments: attachmentsByMsgId.get(m.id) ?? [],
    };
  });
```

(f) Resolve + return the viewer. Replace the final return (lines 166-176):

```ts
  const userRepo = await getUserRepo();
  const viewerUser = await userRepo.findById(ws.userId);

  return {
    ok: true,
    conversationId,
    counterparty: {
      workspaceId: counterpartyWsId,
      name: counterpartyWs?.name ?? '상대',
      type: counterpartyType,
    },
    viewer: { userId: ws.userId, name: viewerUser?.name ?? '' },
    messages,
  };
```

- [ ] **Step 4: Run loader test to verify it passes**

Run: `pnpm test lib/server/actions/chat/__tests__/conversationLoaders.test.ts`
Expected: PASS (전체 파일 green).

- [ ] **Step 5: Keep `ThreadView.tsx` compiling — add `viewer` prop + author fields to the two message literals**

(a) Extend `LiveMessagePayload` (lines 42-51). Add three optional fields after `authorWsId`:

```ts
type LiveMessagePayload = {
  type?: string;
  id?: string;
  body?: string;
  authorWsId?: string;
  authorUserId?: string;
  authorName?: string;
  authorEmail?: string;
  rfpId?: string | null;
  createdAt?: string;
  attachments?: { id: string; name: string; size: number; mimeType: string; url: string }[];
  [k: string]: unknown;
};
```

(b) Add `viewer` to `Props` (after `counterparty`, ~line 26):

```ts
  counterparty: { workspaceId: string; name: string; type: 'buyer' | 'pg' };
  /** 세션 사용자 — 낙관적 self 말풍선이 즉시 자기 이름을 보여줄 때 쓴다. */
  viewer: { userId: string; name: string };
```

(c) Destructure `viewer` in the component signature (lines 133-141), adding it to the params:

```ts
export function ThreadView({
  conversationId,
  counterparty,
  viewer,
  messages,
  rfpById,
  onBack,
  variant = 'page',
  defaultRfpId,
}: Props) {
```

(d) Live-append literal — the `return [...prev, {...}]` branch in `onMessage` (lines 241-252). Replace it with:

```ts
        return [
          ...prev,
          {
            id,
            authorUserId: data.authorUserId ?? '',
            authorName: data.authorName ?? '',
            authorEmail: data.authorEmail ?? '',
            sender,
            body: data.body as string,
            rfpId: data.rfpId ?? null,
            createdAt: data.createdAt as string,
            readByCounterparty: false,
            attachments: data.attachments ?? [],
          },
        ];
```

(e) Optimistic-send literal — in `handleSend`, the `setLocalMessages((prev) => [...prev, {...}])` (lines 382-394). Replace the pushed object with:

```ts
    setLocalMessages((prev) => [
      ...prev,
      {
        id: tempId,
        authorUserId: viewer.userId,
        authorName: viewer.name,
        authorEmail: '',
        sender: 'self',
        body,
        rfpId: defaultRfpId ?? null,
        createdAt: new Date().toISOString(),
        readByCounterparty: false,
        attachments: optimisticAttachments,
        pending: true,
      },
    ]);
```

- [ ] **Step 6: Pass `viewer` through `ThreadPane.tsx`**

Replace the body of `ThreadPane` (lines 24-38):

```ts
  const result = use(getThreadPromise(conversationId));
  const counterparty = result.ok ? result.counterparty : counterpartyFallback;
  const messages = result.ok ? result.messages : [];
  const viewer = result.ok ? result.viewer : { userId: '', name: '' };
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
    />
  );
```

- [ ] **Step 7: Make the component test type-consistent — `components/messages/__tests__/ThreadView.test.tsx`**

(a) Add a `viewer` const and pass it in `base()`. Replace lines 79 + 104-113:

```ts
const counterparty = { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' as const };
const viewer = { userId: 'u-self', name: '나' };
```

```ts
function base(overrides: Partial<React.ComponentProps<typeof ThreadView>> = {}) {
  return (
    <ThreadView
      conversationId="conv-1"
      counterparty={counterparty}
      viewer={viewer}
      messages={messages}
      {...overrides}
    />
  );
}
```

(b) Add author fields to the shared `messages` const (lines 83-102):

```ts
const messages: ThreadMessage[] = [
  {
    id: 'm1',
    authorUserId: 'u-pg',
    authorName: 'OO페이담당',
    authorEmail: 'sales@pg.com',
    sender: 'other',
    body: '안녕하세요, 제안 드립니다.',
    rfpId: null,
    createdAt: '2026-05-26T05:00:00.000Z',
    readByCounterparty: false,
    attachments: [],
  },
  {
    id: 'm2',
    authorUserId: 'u-self',
    authorName: '나',
    authorEmail: 'me@buyer.com',
    sender: 'self',
    body: '확인했습니다. 감사합니다.',
    rfpId: null,
    createdAt: '2026-05-27T05:00:00.000Z',
    readByCounterparty: false,
    attachments: [],
  },
];
```

(c) Add author fields to the `partial` fixture (lines 150-168): both objects get `authorUserId: 'u-self', authorName: '나', authorEmail: 'me@buyer.com',` immediately after their `id`.

(d) Add author fields to the `withRfp` fixture (lines 324-333): after `id: 'm3',` add `authorUserId: 'u-pg', authorName: 'OO페이담당', authorEmail: 'sales@pg.com',`.

(e) Add author fields to the URL-autolink fixture (lines 348-357): after `id: 'm4',` add `authorUserId: 'u-pg', authorName: 'OO페이담당', authorEmail: 'sales@pg.com',`.

(f) Update the grouping factories (lines 639-644):

```ts
  const other = (id: string, body: string, createdAt: string): ThreadMessage => ({
    id, authorUserId: 'u-pg', authorName: 'OO페이담당', authorEmail: 'sales@pg.com',
    sender: 'other', body, rfpId: null, createdAt, readByCounterparty: false, attachments: [],
  });
  const self = (id: string, body: string, createdAt: string): ThreadMessage => ({
    id, authorUserId: 'u-self', authorName: '나', authorEmail: 'me@buyer.com',
    sender: 'self', body, rfpId: null, createdAt, readByCounterparty: false, attachments: [],
  });
```

(g) Add author fields to the `messagesWithAttachment` fixture (lines 943-961): after `id: 'm-att',` add `authorUserId: 'u-pg', authorName: 'OO페이담당', authorEmail: 'sales@pg.com',`.

- [ ] **Step 8: Update the `MessageInbox.test.tsx` loader mock (renders real ThreadView via ThreadPane)**

`MessageInbox.test` mounts the real ThreadView through ThreadPane with a mocked `loadConversationThread` — the mock must now return `viewer` and the message must carry author fields (else viewer is undefined and the author header renders empty). Replace the `loadConversationThread.mockResolvedValue({...})` block (lines 74-89):

```ts
    loadConversationThread.mockResolvedValue({
      ok: true,
      conversationId: 'conv-1',
      counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' },
      viewer: { userId: 'u-self', name: '나' },
      messages: [
        {
          id: 'm1',
          authorUserId: 'u-pg',
          authorName: 'OO페이담당',
          authorEmail: 'sales@pg.com',
          sender: 'other',
          body: '스레드 본문 메시지입니다.',
          rfpId: null,
          createdAt: '2026-06-02T01:00:00.000Z',
          readByCounterparty: false,
          attachments: [],
        },
      ],
    });
```

(`ChatRail.test.tsx` mocks `../ThreadPane`, so it is unaffected — no change.)

- [ ] **Step 9: Run the affected component tests — still green (no behavior change yet)**

Run: `pnpm test components/messages/__tests__/ThreadView.test.tsx components/messages/__tests__/MessageInbox.test.tsx`
Expected: PASS — 렌더는 그대로(헤더=워크스페이스명 'OO페이')라 기존 그룹핑 테스트 포함 전부 통과.

- [ ] **Step 10: Commit**

```bash
git add lib/server/actions/chat/conversationLoaders.ts lib/server/actions/chat/__tests__/conversationLoaders.test.ts components/messages/ThreadView.tsx components/messages/ThreadPane.tsx components/messages/__tests__/ThreadView.test.tsx components/messages/__tests__/MessageInbox.test.tsx
git commit -m "feat(chat): thread author identity + viewer through the loader" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `ThreadView` 작성자 헤더 렌더링 (동작 변경)

헤더를 워크스페이스명 → **작성자 이름**으로, 양쪽(self·other) 모두 표시하고, 그룹핑 기준을 `authorUserId`로 바꾸고, 이름 호버에 이메일(`title`)을 단다.

**Files:**
- Modify: `components/messages/ThreadView.tsx:12 (import), 529-579 (render)`
- Test: `components/messages/__tests__/ThreadView.test.tsx`

- [ ] **Step 1: Write the failing behavior tests**

Add a new `describe` block at the end of `components/messages/__tests__/ThreadView.test.tsx` (before the file's final closing — it's top-level, so append after the last `describe`):

```ts
describe('ThreadView 작성자(담당자) 표시', () => {
  const mk = (
    id: string,
    sender: 'self' | 'other',
    authorUserId: string,
    authorName: string,
    body: string,
    createdAt: string,
    authorEmail = `${authorUserId}@x.com`,
  ): ThreadMessage => ({
    id, authorUserId, authorName, authorEmail, sender, body, rfpId: null,
    createdAt, readByCounterparty: false, attachments: [],
  });

  it('받은 메시지와 보낸 메시지 모두 작성자 이름 헤더를 표시한다', () => {
    render(base({ messages: [
      mk('a1', 'other', 'u-pg', '박영업', '안녕하세요', '2026-05-26T05:00:00.000Z'),
      mk('a2', 'self', 'u-self', '김구매', '확인했습니다', '2026-05-26T05:00:30.000Z'),
    ] }));
    const received = screen.getByText('안녕하세요').closest('[data-message-row]') as HTMLElement;
    const sent = screen.getByText('확인했습니다').closest('[data-message-row]') as HTMLElement;
    expect(within(received).getByText('박영업')).toBeInTheDocument();
    expect(within(sent).getByText('김구매')).toBeInTheDocument();
  });

  it('같은 측이라도 작성자가 다르면 각자 헤더를 표시한다(우리 팀원 구분)', () => {
    render(base({ messages: [
      mk('t1', 'self', 'u-self', '김구매', '제가 보냅니다', '2026-05-26T05:00:00.000Z'),
      mk('t2', 'self', 'u-mate', '이동료', '제가 이어서요', '2026-05-26T05:01:00.000Z'),
    ] }));
    const second = screen.getByText('제가 이어서요').closest('[data-message-row]') as HTMLElement;
    expect(within(second).getByText('이동료')).toBeInTheDocument();
  });

  it('같은 작성자가 5분 내 연속이면 두 번째부터 헤더를 생략한다', () => {
    render(base({ messages: [
      mk('s1', 'other', 'u-pg', '박영업', '첫 줄', '2026-05-26T05:00:00.000Z'),
      mk('s2', 'other', 'u-pg', '박영업', '둘째 줄', '2026-05-26T05:02:00.000Z'),
    ] }));
    const first = screen.getByText('첫 줄').closest('[data-message-row]') as HTMLElement;
    const second = screen.getByText('둘째 줄').closest('[data-message-row]') as HTMLElement;
    expect(within(first).getByText('박영업')).toBeInTheDocument();
    expect(within(second).queryByText('박영업')).not.toBeInTheDocument();
  });

  it('작성자 이름에 이메일 title(호버)을 단다', () => {
    render(base({ messages: [
      mk('e1', 'other', 'u-pg', '박영업', '메일 확인', '2026-05-26T05:00:00.000Z', 'park@pg.com'),
    ] }));
    expect(screen.getByText('박영업')).toHaveAttribute('title', 'park@pg.com');
  });

  it('낙관적으로 보낸 메시지는 viewer 이름으로 헤더를 표시한다', async () => {
    const user = userEvent.setup();
    render(base({ messages: [] }));
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '내 첫 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    const row = (await screen.findByText('내 첫 메시지')).closest('[data-message-row]') as HTMLElement;
    expect(within(row).getByText('나')).toBeInTheDocument(); // viewer.name
  });

  it('라이브 수신 메시지는 페이로드의 authorName 으로 헤더를 표시한다', async () => {
    render(base({ messages: [] }));
    act(() => {
      channelOptions.onMessage?.({
        type: 'message',
        id: 'live-author',
        body: '실시간 담당자',
        authorWsId: 'pg-1',
        authorUserId: 'u-pg',
        authorName: '최라이브',
        authorEmail: 'choi@pg.com',
        rfpId: null,
        createdAt: '2026-05-27T06:00:00.000Z',
      });
    });
    const row = (await screen.findByText('실시간 담당자')).closest('[data-message-row]') as HTMLElement;
    expect(within(row).getByText('최라이브')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test components/messages/__tests__/ThreadView.test.tsx -t "작성자"`
Expected: FAIL — 현재 헤더는 워크스페이스명('OO페이')만 그리므로 '박영업'/'김구매' 등을 못 찾음.

- [ ] **Step 3: Add the `Avatar` import — `components/messages/ThreadView.tsx`**

After the `WorkspaceAvatar` import (line 12) add:

```ts
import { Avatar } from '@/components/primitives/Avatar';
```

- [ ] **Step 4: Change grouping key + header condition + header content**

In the `localMessages.map(...)` block, replace the grouping/condition lines (542-547):

```ts
          const groupedWithPrev =
            !!prev &&
            prev.sender === m.sender &&
            !showDivider &&
            withinGroupWindow(prev.createdAt, m.createdAt);
          const showSenderHeader = !isSelf && !groupedWithPrev;
```

with:

```ts
          // 작성자(authorUserId) 기준 그룹핑 — 같은 회사라도 담당자가 다르면
          // 묶음·헤더를 분리한다. 양쪽(self·other) 모두 작성자 헤더를 단다.
          const groupedWithPrev =
            !!prev &&
            prev.authorUserId === m.authorUserId &&
            !showDivider &&
            withinGroupWindow(prev.createdAt, m.createdAt);
          const showAuthorHeader = !groupedWithPrev;
```

Then replace the header render block (568-579):

```ts
                {showSenderHeader && (
                  <div className="flex items-center gap-1.5">
                    <WorkspaceAvatar
                      name={counterparty.name}
                      size="sm"
                      workspaceId={counterparty.workspaceId}
                    />
                    <span className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]">
                      {counterparty.name}
                    </span>
                  </div>
                )}
```

with:

```ts
                {showAuthorHeader && (
                  <div className="flex items-center gap-1.5">
                    <Avatar name={m.authorName} size="sm" color={isSelf ? 'primary' : 'surface'} />
                    <span
                      title={m.authorEmail || undefined}
                      className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]"
                    >
                      {m.authorName}
                    </span>
                  </div>
                )}
```

- [ ] **Step 5: Update the existing grouping tests' header expectation (workspace name → author name)**

In `describe('ThreadView 연속 메시지 그룹핑', ...)`, the four assertions currently look for `'OO페이'`. The `other()` factory now sets `authorName: 'OO페이담당'`, so update:

- Line ~653: `expect(within(first).getByText('OO페이')).toBeInTheDocument();` → `expect(within(first).getByText('OO페이담당')).toBeInTheDocument();`
- Line ~654: `expect(within(second).queryByText('OO페이')).not.toBeInTheDocument();` → `...queryByText('OO페이담당')...`
- Line ~664: `expect(within(third).getByText('OO페이')).toBeInTheDocument();` → `...getByText('OO페이담당')...`
- Line ~673: `expect(within(second).getByText('OO페이')).toBeInTheDocument();` → `...getByText('OO페이담당')...`
- Line ~682: `expect(within(second).getByText('OO페이')).toBeInTheDocument();` → `...getByText('OO페이담당')...`

Also the test titled "sender 가 바뀌면 헤더를 다시 표시한다" (line ~657) still holds — `s2` is self (`u-self`), `s3` is other (`u-pg`), so the author changes and the header reappears. No fixture change needed beyond the factory update already done in Task 3.

- [ ] **Step 6: Run the full component test file**

Run: `pnpm test components/messages/__tests__/ThreadView.test.tsx`
Expected: PASS (전체 green — 새 작성자 테스트 + 갱신된 그룹핑 테스트 + 기존 테스트 모두).

- [ ] **Step 7: Commit**

```bash
git add components/messages/ThreadView.tsx components/messages/__tests__/ThreadView.test.tsx
git commit -m "feat(chat): render per-message sender name+avatar in thread" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Health gate (typecheck · lint · 관련 스위트)

**Files:** none (검증만)

- [ ] **Step 1: Typecheck the changed surface**

Run: `pnpm tsc --noEmit 2>&1 | grep -E "chat-message|conversationLoaders|ThreadView|ThreadPane|services/chat|sendChatMessageAction|repositories/types" || echo "no errors in changed files"`
Expected: `no errors in changed files`. (참고: 클린 HEAD의 tsc 는 무관한 wizard 테스트 글로벌로 이미 빨갈 수 있음 — 위 grep 으로 우리 변경 파일만 본다.)

- [ ] **Step 2: Lint the changed files**

Run: `pnpm lint 2>&1 | tail -5`
Expected: 0 errors (warnings 무방). 새 에러가 있으면 해당 파일만 수정.

- [ ] **Step 3: Run all chat/messages suites together (회귀 확인)**

Run: `pnpm test lib/server/actions/chat lib/server/repositories/drizzle/__tests__/chat-message.test.ts lib/server/services/__tests__/chat components/messages`
Expected: PASS (all). 단독 green 이 게이트 — 전체 `pnpm test` 가 스왑 스래시로 느릴 수 있으니(메모리 참조) 관련 스위트로 한정.

- [ ] **Step 4: Commit (if any fixups were needed)**

```bash
git add -A
git commit -m "chore(chat): lint/type fixups for sender display" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(수정이 없었으면 이 커밋은 건너뛴다.)

---

## Notes / 함정

- **vitest 는 파일 단위 esbuild(타입체크 안 함)** — 단일 파일 테스트는 다른 파일의 타입 불일치와 무관하게 돈다. 그래도 각 태스크는 프로덕션 코드가 컴파일되도록 구성했다.
- **워크트리 절대경로 함정** — 모든 Read/Write/Edit 은 `/Users/yeonseong/project/bidit/.worktrees/feat-chat-message-sender-account/` 하위 경로로. 메인 저장소를 건드리지 않는다.
- **이메일 호버는 `title` 속성**으로 구현(스펙의 "호버" 결정 충족). base-ui `Tooltip` 대신 택한 이유: jsdom 포털/호버 플럼빙 없이 회귀 테스트가 견고하고 접근성 기본 제공. 추후 스타일 툴팁으로 폴리시 가능.
- **innerJoin 안전성** — `chat_messages.author_user_id` FK(NO ACTION)가 작성자 행 존재를 보장하므로 메시지가 조인에서 누락되지 않는다.
- **DDL/마이그레이션 없음** — 순수 코드 변경. 배포 순서 무관(서버/클라 독립).
