import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: vi.fn(),
}));
vi.mock('@/lib/observability/capture', () => ({ captureActionError: vi.fn() }));

import { useStartConversation } from '../useStartConversation';
import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';
import { captureActionError } from '@/lib/observability/capture';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useStartConversation', () => {
  it('성공 시 대화 목록으로 이동한다', async () => {
    vi.mocked(getOrCreateConversationAction).mockResolvedValueOnce({
      ok: true,
      conversationId: 'conv-1',
    });
    const { result } = renderHook(() => useStartConversation());
    await act(() => result.current.start('ws-1'));
    expect(nav.push).toHaveBeenCalledWith('/messages?c=conv-1');
    expect(captureActionError).not.toHaveBeenCalled();
  });

  it('액션이 throw 하면 Sentry 로 관측 신호를 보내고 메시지 목록으로 보낸다(조용히 삼키지 않는다)', async () => {
    const boom = new Error('boom');
    vi.mocked(getOrCreateConversationAction).mockRejectedValueOnce(boom);
    const { result } = renderHook(() => useStartConversation());
    await act(() => result.current.start('ws-1'));
    expect(captureActionError).toHaveBeenCalledWith('chat.start_conversation', boom, null);
    expect(nav.push).toHaveBeenCalledWith('/messages');
  });
});
