import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// ThreadView/ThreadPane 가 app router/pathname/search 를 읽으므로 스텁한다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/messages',
  useSearchParams: () => new URLSearchParams(),
}));

// loadConversationThread is a 'use server' action — mock it so selecting a
// conversation in MessageInbox loads its thread without a DB.
const loadConversationThread = vi.fn();
vi.mock('@/lib/server/actions/chat/conversationLoaders', () => ({
  loadConversationThread: (...args: unknown[]) => loadConversationThread(...args),
}));

// MessageInbox mounts the 새 대화 entry (NewConversationSheet), which imports
// the send action — mock it so the inbox renders without a DB.
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: vi.fn(),
}));

// Opening a thread mounts ThreadView, which fires mark-read (a server action,
// jsdom-unsafe) and subscribes via useChatChannel (real centrifuge SDK) — mock
// both so the inbox renders without a DB or live transport.
vi.mock('@/lib/server/actions/chat/markConversationReadAction', () => ({
  markConversationReadAction: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/hooks/useChatChannel', () => ({
  useChatChannel: () => ({ online: false, typingUserIds: [], sendTyping: vi.fn(), connected: null }),
}));

// ThreadView mounts AttachmentGalleryPanel, which imports listConversationAttachments
// (a 'use server' action that transitively pulls in next-auth) — mock it so the
// suite collects without resolving next-auth's `next/server` import under vitest.
vi.mock('@/lib/server/actions/chat/listConversationAttachments', () => ({
  listConversationAttachments: vi.fn().mockResolvedValue([]),
}));

afterEach(() => cleanup());
beforeEach(() => {
  loadConversationThread.mockReset();
  clearAllThreadCache();
});

import { MessageInbox } from '../MessageInbox';
import { clearAllThreadCache } from '../thread-cache';
import type { ConversationListItem } from '../types';

const conversations: ConversationListItem[] = [
  {
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg', hasLogo: false },
    rfpId: null,
    preview: '제안 보냅니다.',
    lastMessageAt: '2026-06-02T01:00:00.000Z',
    unread: true,
  },
];

describe('MessageInbox', () => {
  it('selecting a conversation loads its thread via the server action', async () => {
    const user = userEvent.setup();
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

    render(<MessageInbox conversations={conversations} />);

    // Empty panel before selection.
    expect(screen.getByText('대화를 선택하세요')).toBeInTheDocument();

    // Wrap the click + Suspense resolution in a single awaited act so React
    // can flush the async Suspense retry (use() pings back through act's queue).
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /OO페이/ }));
    });

    expect(loadConversationThread).toHaveBeenCalledWith('conv-1');
    expect(screen.getByText('스레드 본문 메시지입니다.')).toBeInTheDocument();
  });

  it('does not call the loader on first render (only on select)', async () => {
    render(<MessageInbox conversations={conversations} />);
    await waitFor(() => {
      expect(loadConversationThread).not.toHaveBeenCalled();
    });
  });

  it('인박스 상단에 새 대화 시작 진입점을 노출한다', () => {
    render(<MessageInbox conversations={conversations} />);
    expect(screen.getByRole('button', { name: '새 대화' })).toBeInTheDocument();
  });

  it('미선택 상태: 목록은 표시하고 스레드 pane 은 모바일에서 숨긴다(데스크톱만 표시)', () => {
    const { container } = render(<MessageInbox conversations={conversations} />);
    const list = container.querySelector('[data-pane="list"]') as HTMLElement;
    const thread = container.querySelector('[data-pane="thread"]') as HTMLElement;
    // 목록: 모바일 전체폭, 데스크톱 고정폭. 미선택 시 항상 보인다.
    expect(list.className).toContain('w-full');
    expect(list.className).toContain('md:w-80');
    expect(list.className).not.toContain('hidden');
    // 스레드: 미선택 시 모바일에서 숨고 데스크톱(md)에서만 보인다.
    expect(thread.className).toContain('hidden');
    expect(thread.className).toContain('md:flex');
  });

  it('대화 선택 시: 목록 pane 은 모바일에서 숨고 스레드 pane 이 표시된다', async () => {
    const user = userEvent.setup();
    loadConversationThread.mockResolvedValue({
      ok: true,
      conversationId: 'conv-1',
      counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' },
      viewer: { userId: 'u-self', name: '나' },
      messages: [],
    });
    const { container } = render(<MessageInbox conversations={conversations} />);
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /OO페이/ }));
    });
    const list = container.querySelector('[data-pane="list"]') as HTMLElement;
    const thread = container.querySelector('[data-pane="thread"]') as HTMLElement;
    expect(list.className).toContain('hidden');
    expect(list.className).toContain('md:flex');
    expect(thread.className).not.toContain('hidden');
  });

  it('모바일 뒤로가기 버튼을 누르면 대화 목록으로 돌아간다', async () => {
    const user = userEvent.setup();
    loadConversationThread.mockResolvedValue({
      ok: true,
      conversationId: 'conv-1',
      counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' },
      viewer: { userId: 'u-self', name: '나' },
      messages: [],
    });
    render(<MessageInbox conversations={conversations} />);
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /OO페이/ }));
    });
    expect(screen.queryByText('대화를 선택하세요')).not.toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: '대화 목록' }));
    });
    expect(screen.getByText('대화를 선택하세요')).toBeInTheDocument();
  });

  it('대화 선택 중 로딩 스켈레톤을 표시한다', async () => {
    const user = userEvent.setup();
    // Return a promise that never resolves during this test
    let resolveThread!: (v: unknown) => void;
    loadConversationThread.mockReturnValue(
      new Promise((resolve) => { resolveThread = resolve; })
    );

    render(<MessageInbox conversations={conversations} />);
    await user.click(screen.getByRole('button', { name: /OO페이/ }));

    // While loading, skeleton is visible (animate-pulse element)
    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    // Cleanup: resolve so no pending promises leak
    resolveThread({ ok: false, error: 'CANCELLED' });
  });

  it('initialSelectedId로 마운트 시 해당 대화의 스레드를 즉시 보여준다', async () => {
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
});
