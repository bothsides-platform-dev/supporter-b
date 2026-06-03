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

// SplitView mounts PeekBackdrop, which reads the app router/pathname/search.
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
      messages: [
        {
          id: 'm1',
          sender: 'other',
          body: '스레드 본문 메시지입니다.',
          rfpId: null,
          createdAt: '2026-06-02T01:00:00.000Z',
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
});
