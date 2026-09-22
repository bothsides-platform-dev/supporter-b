// ThreadView — sendDisabledReason="guest" (랜딩 데모, 비로그인)
//
// 데모는 실제 스레드 뷰를 그대로 쓰므로, 전송만 막는 것으로는 부족하다:
// 읽음 기록(서버 액션)과 Centrifugo 비공개 채널 구독은 계정이 없어 반드시 실패한다.
// 여기서 그 두 부수효과가 끊겼는지, 그리고 로그인 사용자 경로('closed'·기본)는
// 그대로인지(회귀 가드) 함께 본다.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import type { UseChatChannelResult } from '@/lib/hooks/useChatChannel';
import type { ThreadMessage } from '../types';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// 읽음의 두 번째 게이트(하단 센티널 가시성) — jsdom 에는 IntersectionObserver 가 없다.
type IoCb = (entries: { isIntersecting: boolean }[]) => void;
const intersectionObservers: { fire: (v: boolean) => void }[] = [];
class IntersectionObserverStub {
  constructor(cb: IoCb) {
    intersectionObservers.push({ fire: (v) => cb([{ isIntersecting: v }]) });
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

// 서버 액션은 전부 jsdom-unsafe — 프로덕션 코드가 .then 을 부르므로 프로미스를 돌려준다.
const sendChatMessageAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: (...args: unknown[]) => sendChatMessageAction(...args),
}));
vi.mock('@/lib/server/actions/chat/listConversationAttachments', () => ({
  listConversationAttachments: vi.fn().mockResolvedValue([]),
}));
const markConversationReadAction = vi.fn();
vi.mock('@/lib/server/actions/chat/markConversationReadAction', () => ({
  markConversationReadAction: (...args: unknown[]) => markConversationReadAction(...args),
}));
vi.mock('@/lib/hooks/useNotifications', () => ({ markThreadReadLocal: vi.fn() }));
vi.mock('@/lib/server/actions/user/getUserProfileAction', () => ({
  getUserProfileAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/chat/listTemplatesAction', () => ({
  listTemplatesAction: vi.fn().mockResolvedValue({ ok: true, templates: [] }),
}));
vi.mock('@/lib/server/actions/chat/saveTemplateAction', () => ({
  saveTemplateAction: vi.fn(),
}));
vi.mock('@/lib/attachments/upload-client', () => ({ uploadAttachment: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/presence/WorkspacePresenceProvider', () => ({
  useWorkspacePresence: () => ({ online: false, activity: 'offline' }),
  useUserPresence: () => false,
}));

// useChatChannel 은 실제 centrifuge SDK 를 끌고 온다 — 목하고, 넘어온
// `enabled` 를 캡처해 게스트가 구독을 끊는지 본다.
let channelEnabled: boolean | undefined;
const sendTyping = vi.fn();
vi.mock('@/lib/hooks/useChatChannel', () => ({
  useChatChannel: (
    _conversationId: string,
    opts: { enabled?: boolean },
  ): UseChatChannelResult => {
    channelEnabled = opts.enabled;
    return { typingUserIds: [], sendTyping, connected: null };
  },
}));
vi.mock('../ContextPanel', () => ({ ContextPanel: () => <div data-testid="context-panel" /> }));

import { ThreadView } from '../ThreadView';
import { MARK_READ_DEBOUNCE_MS } from '@/lib/hooks/useMarkReadWhileVisible';

/** 읽음은 트레일링 디바운스 — "호출 안 함"을 단언하기 전에 그 창을 지나 보낸다. */
async function flushReadDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, MARK_READ_DEBOUNCE_MS + 50));
  });
}

const counterparty = { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' as const, logoUpdatedAt: null };
const viewer = { userId: 'u-self', name: '나', avatarUpdatedAt: null };
const messages: ThreadMessage[] = [
  {
    id: 'm1',
    authorUserId: 'u-pg',
    authorName: 'OO페이담당',
    authorEmail: 'sales@pg.com',
    authorAvatarUpdatedAt: null,
    sender: 'other',
    body: '안녕하세요, 제안 드립니다.',
    rfpId: null,
    createdAt: '2026-05-26T05:00:00.000Z',
    readByCounterparty: false,
    attachments: [],
  },
];

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

afterEach(() => cleanup());
beforeEach(() => {
  markConversationReadAction.mockReset();
  markConversationReadAction.mockResolvedValue({ ok: true, readAt: '2026-05-27T05:00:00.000Z' });
  sendChatMessageAction.mockReset();
  sendChatMessageAction.mockResolvedValue({ ok: true, conversationId: 'conv-1', messageId: 'm-new' });
  sendTyping.mockReset();
  window.localStorage.clear();
  intersectionObservers.length = 0;
  channelEnabled = undefined;
});

describe('ThreadView — sendDisabledReason="guest" (랜딩 데모)', () => {
  it('가입 안내를 보여주고 입력·전송을 막는다', () => {
    render(base({ sendDisabledReason: 'guest' }));

    expect(screen.getByText('가입하면 구매사와 바로 대화할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeDisabled();
    expect(document.querySelector('input[type="file"]')).toBeDisabled();
  });

  it("종료('closed') 안내와 섞이지 않는다", () => {
    render(base({ sendDisabledReason: 'guest' }));
    expect(screen.queryByText(/선정이 끝나 이 대화는 종료됐어요/)).not.toBeInTheDocument();
  });

  it('읽음 기록 서버 액션을 부르지 않는다 (계정이 없다)', async () => {
    render(base({ sendDisabledReason: 'guest' }));
    act(() => {
      for (const o of intersectionObservers) o.fire(true);
    });
    await flushReadDebounce();

    expect(markConversationReadAction).not.toHaveBeenCalled();
  });

  it('비공개 채널 구독을 끈다 (useChatChannel enabled=false)', () => {
    render(base({ sendDisabledReason: 'guest' }));
    expect(channelEnabled).toBe(false);
  });
});

// ── 회귀 가드: 로그인 사용자 경로는 그대로다 ──────────────────────────
describe('ThreadView — 게스트가 아닌 경로 (회귀 가드)', () => {
  it('기본(사유 없음)은 읽음 기록과 채널 구독을 그대로 한다', async () => {
    render(base());
    act(() => {
      for (const o of intersectionObservers) o.fire(true);
    });
    await flushReadDebounce();

    expect(markConversationReadAction).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      throughMessageId: 'm1',
    });
    expect(channelEnabled).toBe(true);
  });

  it("'closed' 는 로그인 사용자다 — 읽음·구독은 살아 있고 전송만 막힌다", async () => {
    render(base({ sendDisabledReason: 'closed' }));
    act(() => {
      for (const o of intersectionObservers) o.fire(true);
    });
    await flushReadDebounce();

    expect(markConversationReadAction).toHaveBeenCalled();
    expect(channelEnabled).toBe(true);
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeDisabled();
  });
});
