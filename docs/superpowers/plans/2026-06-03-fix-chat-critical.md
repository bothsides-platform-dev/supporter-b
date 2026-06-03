# Chat Critical Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 개의 🔴 Critical 이슈 수정 — (1) read receipt가 클라이언트 시계 기준으로 판정되는 문제, (2) Centrifugo 연결 끊김 시 UI에 아무 피드백이 없는 문제.

**Architecture:**
- Fix 1: `markConversationReadAction`이 서버 `now()` 타임스탬프를 반환값 + Centrifugo 이벤트 페이로드 양쪽에 포함하고, `ThreadView`의 `onRead` 핸들러가 `Date.now()` 대신 서버 타임스탬프를 사용한다.
- Fix 2: `useChatChannel`이 Centrifugo client 레벨 `connected`/`disconnected` 이벤트를 구독해 `connected: boolean | null` 상태를 노출하고, `ThreadView`가 `connected === false`일 때 재연결 중 배너를 렌더한다.

**Tech Stack:** Next.js App Router, Server Actions (`'use server'`), Centrifugo (centrifuge-js v5), Vitest + @testing-library/react, PGlite (단위 테스트 DB).

---

## File Map

| 파일 | 변경 종류 | 역할 |
|---|---|---|
| `lib/server/actions/chat/markConversationReadAction.ts` | Modify | 반환 타입 `{ readAt: string }` 추가, 이벤트 페이로드에 `readAt` 포함 |
| `lib/server/realtime/centrifugo.ts` | Modify | `ChatRealtimeEvent.read` 타입에 `readAt?: string` 추가 |
| `lib/hooks/useChatChannel.ts` | Modify | `ChatPayload`에 `readAt?: string`, `connected: boolean \| null` 상태 추가 |
| `components/messages/ThreadView.tsx` | Modify | `onRead`가 `data.readAt` 사용, `connected === false` 배너 렌더 |
| `lib/server/actions/chat/__tests__/sendChatMessage.test.ts` | Modify | `markConversationReadAction` 테스트에 `readAt` 반환값 + publish 페이로드 어서션 추가 |
| `lib/hooks/__tests__/useChatChannel.test.ts` | Modify | mockClient에 `on`/`__fire` 추가, connected/disconnected 이벤트 테스트 추가 |
| `components/messages/__tests__/ThreadView.test.tsx` | Modify | `channelResult` 타입에 `connected` 추가, 배너 렌더 테스트 추가 |

---

## Task 1: markConversationReadAction — 서버 타임스탬프 반환 + 이벤트 페이로드

**Files:**
- Modify: `lib/server/actions/chat/markConversationReadAction.ts`
- Modify: `lib/server/realtime/centrifugo.ts`

- [ ] **Step 1: 실패 테스트 작성**

`lib/server/actions/chat/__tests__/sendChatMessage.test.ts`의 `markConversationReadAction` describe 블록 내 기존 "upserts last_read_at" 테스트를 아래로 교체한다. (기존 테스트는 `r.ok === true`만 검사하므로 `readAt` 필드가 없어도 통과됨 — 새 어서션이 RED를 만든다.)

```typescript
it('upserts last_read_at for a member and returns server readAt timestamp', async () => {
  const { buyerUser, buyerWs, pgWs } = await seedPair();
  const conv = await (await getChatConversationRepo()).findOrCreatePair(
    buyerWs.id,
    pgWs.id,
  );
  asBuyer(buyerUser, buyerWs.id);
  const before = Date.now();

  const r = await markConversationReadAction({ conversationId: conv.id });

  const after = Date.now();
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  // 반환된 readAt은 ISO 8601 문자열
  expect(typeof r.readAt).toBe('string');
  const ts = Date.parse(r.readAt);
  expect(ts).toBeGreaterThanOrEqual(before);
  expect(ts).toBeLessThanOrEqual(after);
  // DB row도 upsert됨
  const row = await (await getChatReadRepo()).getFor(conv.id, buyerUser.id);
  expect(row).toBeDefined();
});

it('publishes read event with readAt payload', async () => {
  const { buyerUser, buyerWs, pgWs } = await seedPair();
  const conv = await (await getChatConversationRepo()).findOrCreatePair(
    buyerWs.id,
    pgWs.id,
  );
  asBuyer(buyerUser, buyerWs.id);
  publishChatEvent.mockClear();

  await markConversationReadAction({ conversationId: conv.id });

  expect(publishChatEvent).toHaveBeenCalledTimes(1);
  const [, payload] = publishChatEvent.mock.calls[0];
  expect(payload.type).toBe('read');
  expect(payload.userId).toBe(buyerUser.id);
  expect(typeof payload.readAt).toBe('string');
});
```

- [ ] **Step 2: 테스트가 RED인지 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/chat/__tests__/sendChatMessage.test.ts
```

Expected: 새 어서션 2개 FAIL (`r.readAt is undefined`, `payload.readAt is undefined`).

- [ ] **Step 3: centrifugo.ts — `read` 이벤트 타입에 `readAt` 추가**

`lib/server/realtime/centrifugo.ts` 상단 `ChatRealtimeEvent` 타입 수정:

```typescript
export type ChatRealtimeEvent =
  | { type: 'message'; id: string; [k: string]: unknown }
  | { type: 'read'; readAt?: string; [k: string]: unknown }
  | { type: string; [k: string]: unknown };
```

- [ ] **Step 4: markConversationReadAction.ts — 반환값 + 이벤트 페이로드 수정**

`lib/server/actions/chat/markConversationReadAction.ts` 전체 교체:

```typescript
'use server';

import { z } from 'zod';

import {
  getChatConversationRepo,
  getChatReadRepo,
} from '@/lib/server/repositories/factory';
import { publishChatEvent } from '@/lib/server/realtime/centrifugo';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.object({ conversationId: z.string().uuid() }).strict();

export type MarkConversationReadInput = z.infer<typeof Input>;
export type MarkConversationReadResult = ChatActionResult<{ readAt: string }>;

export async function markConversationReadAction(
  input: MarkConversationReadInput,
): Promise<MarkConversationReadResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const conv = await (await getChatConversationRepo()).findById(
    parsed.data.conversationId,
  );
  if (!conv) return { ok: false, error: 'CONVERSATION_NOT_FOUND' };
  const myWsId = ws.workspaceType === 'buyer' ? conv.buyerWsId : conv.pgWsId;
  if (myWsId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };

  const now = new Date();
  await (await getChatReadRepo()).upsert(conv.id, ws.userId, now);

  // Best-effort live read receipt to the counterparty.
  // readAt travels in the payload so the receiver uses server time, not client clock.
  await publishChatEvent(conv.id, {
    type: 'read',
    userId: ws.userId,
    readAt: now.toISOString(),
  });

  return { ok: true, readAt: now.toISOString() };
}
```

- [ ] **Step 5: 테스트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/chat/__tests__/sendChatMessage.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/server/actions/chat/markConversationReadAction.ts \
        lib/server/realtime/centrifugo.ts \
        lib/server/actions/chat/__tests__/sendChatMessage.test.ts
git commit -m "fix(chat): read receipt에 서버 타임스탬프 포함 — readAt을 반환값과 Centrifugo 이벤트 페이로드에 추가"
```

---

## Task 2: ThreadView — onRead에서 서버 타임스탬프 사용

**Files:**
- Modify: `lib/hooks/useChatChannel.ts`
- Modify: `components/messages/ThreadView.tsx`
- Modify: `components/messages/__tests__/ThreadView.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`components/messages/__tests__/ThreadView.test.tsx`에 기존 '라이브 read 이벤트' 테스트 **아래에** 추가:

```typescript
it('onRead 페이로드의 readAt(ISO) 이 있으면 Date.now() 대신 서버 시간을 워터마크로 사용한다', async () => {
  // m2(self, 2026-05-27T05:00:00Z)보다 이전 시각을 readAt으로 넘기면
  // 워터마크 < createdAt → readByCounterparty=false → "읽음" 미표시.
  render(base());
  expect(screen.queryByText('읽음')).not.toBeInTheDocument();

  act(() => {
    // 2026-05-26T04:00:00Z = m2 createdAt 보다 이전
    channelOptions.onRead?.({ type: 'read', userId: 'pg-1', readAt: '2026-05-26T04:00:00.000Z' });
  });

  // readAt < m2.createdAt이므로 읽음 미표시
  expect(screen.queryByText('읽음')).not.toBeInTheDocument();
});

it('onRead readAt 이 m2 이후 시각이면 "읽음" 표시', async () => {
  render(base());

  act(() => {
    channelOptions.onRead?.({ type: 'read', userId: 'pg-1', readAt: '2026-05-28T05:00:00.000Z' });
  });

  expect(await screen.findByText('읽음')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/messages/__tests__/ThreadView.test.tsx
```

Expected: "onRead 페이로드의 readAt(ISO) 이 있으면…" FAIL — 현재 `Date.now()`를 쓰므로 `readAt: '2026-05-26...'` 를 무시하고 읽음이 표시됨.

- [ ] **Step 3: useChatChannel.ts — ChatPayload에 readAt 추가**

`lib/hooks/useChatChannel.ts` 28번 줄 `ChatPayload` 타입 수정:

```typescript
type ChatPayload = { type?: string; userId?: string; readAt?: string; [k: string]: unknown };
```

- [ ] **Step 4: ThreadView.tsx — onRead에서 data.readAt 사용**

`components/messages/ThreadView.tsx`의 `onRead` 콜백 수정. 기존:

```typescript
    onRead: () => {
      // Counterparty read up to "now" — advance the live watermark.
      setReadAt(Date.now());
    },
```

교체:

```typescript
    onRead: (data: LiveMessagePayload) => {
      // Use the server-issued timestamp from the payload to avoid client clock
      // skew. Fall back to Date.now() only if the server omits readAt
      // (e.g. older server during a rolling deploy).
      const ts = data.readAt ? Date.parse(data.readAt as string) : Date.now();
      setReadAt(ts);
    },
```

- [ ] **Step 5: ThreadView.test.tsx — beforeEach mock 응답 확인**

`ThreadView.test.tsx`의 `beforeEach` 에서 `markConversationReadAction.mockResolvedValue({ ok: true })` 는 그대로 둔다. `readAt` 미포함 mock은 `ok: true` 케이스만 테스트하는 것이라 괜찮음 — `onRead` 경로는 분리된 콜백으로 테스트한다.

- [ ] **Step 6: 테스트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/messages/__tests__/ThreadView.test.tsx
```

Expected: 모든 테스트 PASS.

- [ ] **Step 7: useChatChannel 기존 onRead 테스트도 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/hooks/__tests__/useChatChannel.test.ts
```

Expected: 모든 테스트 PASS (type-only 변경이라 동작 변화 없음).

- [ ] **Step 8: Commit**

```bash
git add lib/hooks/useChatChannel.ts \
        components/messages/ThreadView.tsx \
        components/messages/__tests__/ThreadView.test.tsx
git commit -m "fix(chat): read watermark를 서버 타임스탬프 기준으로 변경 — 클라이언트 시계 편차 제거"
```

---

## Task 3: useChatChannel — connected 상태 추가

**Files:**
- Modify: `lib/hooks/useChatChannel.ts`
- Modify: `lib/hooks/__tests__/useChatChannel.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`lib/hooks/__tests__/useChatChannel.test.ts`에서 `mockClient` 선언부를 아래로 교체한다 (client-level 이벤트 핸들러 지원 추가):

```typescript
const mockClientHandlers: Record<string, Handler[]> = {};
const mockClient = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  newSubscription: vi.fn((): MockSub => mockSub),
  getSubscription: vi.fn((): MockSub | null => null),
  removeSubscription: vi.fn(),
  on: vi.fn((event: string, cb: Handler) => {
    (mockClientHandlers[event] ??= []).push(cb);
  }),
  __fire(event: string, ctx: unknown) {
    for (const h of mockClientHandlers[event] ?? []) h(ctx);
  },
};
```

그리고 `beforeEach`에 `Object.keys(mockClientHandlers).forEach(k => delete mockClientHandlers[k])` 를 추가한다:

```typescript
beforeEach(async () => {
  vi.resetModules();
  // clear client-level handlers between tests
  Object.keys(mockClientHandlers).forEach((k) => delete mockClientHandlers[k]);
  mockSub = makeSub();
  mockClient.newSubscription.mockImplementation(() => mockSub);
  mockClient.getSubscription.mockReturnValue(null);
  const { Centrifuge } = await import('centrifuge');
  CentrifugeCtor = Centrifuge as unknown as ReturnType<typeof vi.fn>;
  CentrifugeCtor.mockClear();
});
```

그리고 `'라이브 연결 (URL 설정)'` describe 블록 끝에 테스트 추가:

```typescript
  it('(f) 초기 connected 는 null (미확정)', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useChatChannel } = await import('@/lib/hooks/useChatChannel');

    const { result } = renderHook(() => useChatChannel(CONV_ID, {}));

    expect(result.current.connected).toBeNull();
  });

  it('(g) client connected 이벤트 → connected:true', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useChatChannel } = await import('@/lib/hooks/useChatChannel');

    const { result } = renderHook(() => useChatChannel(CONV_ID, {}));
    expect(result.current.connected).toBeNull();

    act(() => {
      mockClient.__fire('connected', {});
    });

    expect(result.current.connected).toBe(true);
  });

  it('(h) client disconnected 이벤트 → connected:false', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useChatChannel } = await import('@/lib/hooks/useChatChannel');

    const { result } = renderHook(() => useChatChannel(CONV_ID, {}));

    act(() => {
      mockClient.__fire('connected', {});
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      mockClient.__fire('disconnected', {});
    });
    expect(result.current.connected).toBe(false);
  });
```

그리고 `'graceful no-op (URL 미설정)'` 테스트에 `connected` 어서션 추가:

```typescript
    expect(result.current.connected).toBeNull();
```

- [ ] **Step 2: 테스트 RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/hooks/__tests__/useChatChannel.test.ts
```

Expected: (f)(g)(h) FAIL (`result.current.connected` is `undefined`).

- [ ] **Step 3: useChatChannel.ts 구현**

`lib/hooks/useChatChannel.ts` 수정. `UseChatChannelResult`에 `connected` 추가:

```typescript
export type UseChatChannelResult = {
  online: boolean;
  typingUserIds: string[];
  sendTyping: () => void;
  connected: boolean | null;
};
```

`useChatChannel` 함수 본체 시작 부분에 `connected` 상태 추가 및 기존 return문 수정:

```typescript
export function useChatChannel(
  conversationId: string,
  { onMessage, onRead }: UseChatChannelOptions,
): UseChatChannelResult {
  const [online, setOnline] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  // null = 미확정(실시간 미설정 포함), true = 연결됨, false = 끊김
  const [connected, setConnected] = useState<boolean | null>(null);
  const subRef = useRef<Subscription | null>(null);
  // ... (이하 기존 코드)
```

`useEffect` 내 `client.connect()` 호출 **이전**에 client-level 이벤트 리스너 등록 추가:

```typescript
    client.on('connected', () => setConnected(true));
    client.on('disconnected', () => setConnected(false));

    sub.subscribe();
    client.connect();
```

return 구문 수정:

```typescript
  return { online, typingUserIds, sendTyping, connected };
```

- [ ] **Step 4: 테스트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/hooks/__tests__/useChatChannel.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/useChatChannel.ts \
        lib/hooks/__tests__/useChatChannel.test.ts
git commit -m "feat(chat): useChatChannel에 connected 상태 추가 — Centrifugo 연결 끊김 감지"
```

---

## Task 4: ThreadView — 연결 끊김 배너 렌더

**Files:**
- Modify: `components/messages/ThreadView.tsx`
- Modify: `components/messages/__tests__/ThreadView.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`components/messages/__tests__/ThreadView.test.tsx`에서:

1. `channelResult` 초기화에 `connected: null` 추가:

```typescript
let channelResult: UseChatChannelResult = { online: false, typingUserIds: [], sendTyping, connected: null };
```

2. 기존 `beforeEach` 의 `channelResult =` 재할당 줄 수정:

```typescript
  channelResult = { online: false, typingUserIds: [], sendTyping, connected: null };
```

3. 기존 테스트에서 `channelResult =` 재할당하는 곳에 `connected: null` 추가:

```typescript
// 예: online 테스트
channelResult = { online: true, typingUserIds: [], sendTyping, connected: null };
// typing 테스트
channelResult = { online: false, typingUserIds: ['pg-user-1'], sendTyping, connected: null };
```

4. describe 블록 끝에 배너 테스트 추가:

```typescript
  it('connected 가 false 면 "재연결 중" 배너를 렌더한다', () => {
    channelResult = { online: false, typingUserIds: [], sendTyping, connected: false };
    render(base());
    expect(screen.getByRole('status')).toHaveTextContent('재연결 중');
  });

  it('connected 가 null 이면 배너를 렌더하지 않는다', () => {
    channelResult = { online: false, typingUserIds: [], sendTyping, connected: null };
    render(base());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('connected 가 true 면 배너를 렌더하지 않는다', () => {
    channelResult = { online: false, typingUserIds: [], sendTyping, connected: true };
    render(base());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트 RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/messages/__tests__/ThreadView.test.tsx
```

Expected: 타입 에러(TS) 또는 `role="status"` 요소를 찾지 못해 FAIL.

- [ ] **Step 3: ThreadView.tsx 구현**

`components/messages/ThreadView.tsx`에서 `useChatChannel` 구조 분해에 `connected` 추가:

```typescript
  const { online, typingUserIds, sendTyping, connected } = useChatChannel(conversationId, {
```

그리고 스레드 UI의 입력창 바로 위(또는 header 아래)에 배너 추가. 정확한 삽입 위치는 compose 영역 div 바로 위:

```tsx
      {connected === false && (
        <div
          role="status"
          className="px-4 py-1.5 text-body-small text-on-surface-variant bg-surface-container-low border-b border-outline-variant"
        >
          채팅 서버와 연결이 끊겼습니다. 재연결 중…
        </div>
      )}
```

- [ ] **Step 4: 테스트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/messages/__tests__/ThreadView.test.tsx
```

Expected: 모든 테스트 PASS.

- [ ] **Step 5: 전체 chat 관련 테스트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/chat lib/hooks/__tests__/useChatChannel.test.ts components/messages
```

Expected: 모든 PASS.

- [ ] **Step 6: 전체 테스트 스위트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```

Expected: 모든 PASS (BidForm flake 제외 — 알려진 타이밍 flake, 재실행으로 GREEN).

- [ ] **Step 7: Commit**

```bash
git add components/messages/ThreadView.tsx \
        components/messages/__tests__/ThreadView.test.tsx
git commit -m "feat(chat): Centrifugo 연결 끊김 시 ThreadView에 재연결 중 배너 표시"
```

---

## Self-Review

**Spec coverage:**
- [x] Fix 1: `markConversationReadAction` 서버 타임스탬프 반환 → Task 1
- [x] Fix 1: Centrifugo `read` 이벤트에 `readAt` 포함 → Task 1
- [x] Fix 1: `ThreadView.onRead`가 `data.readAt` 사용 → Task 2
- [x] Fix 2: `useChatChannel`이 `connected` 상태 노출 → Task 3
- [x] Fix 2: `ThreadView`가 `connected === false` 배너 렌더 → Task 4
- [x] 모든 변경에 RED→GREEN TDD 사이클 → 각 태스크

**Placeholder 없음:** 모든 스텝에 실제 코드 포함 확인.

**타입 일관성:**
- `MarkConversationReadResult = ChatActionResult<{ readAt: string }>` — Task 1에서 정의, 이후 태스크는 해당 타입을 참조하지 않음 (ThreadView는 void로 호출).
- `UseChatChannelResult.connected: boolean | null` — Task 3에서 추가, Task 4 ThreadView에서 사용.
- `channelResult` 타입 — Task 4에서 `connected: null` 초기값으로 모든 기존 테스트 커버.
