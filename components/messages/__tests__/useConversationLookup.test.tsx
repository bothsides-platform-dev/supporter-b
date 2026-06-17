// useConversationLookup — 상대방 탭의 wsId→conversationId 읽기 전용 해소.
// sealed-bid 핵심 불변식: 열람만으로 대화를 생성하지 않는다(lookup 만 호출, create 안 함).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const lookup = vi.fn();
vi.mock('@/lib/server/actions/chat/lookupConversationAction', () => ({
  lookupConversationAction: (...a: unknown[]) => lookup(...a),
}));

import { useConversationLookup } from '../useConversationLookup';

beforeEach(() => lookup.mockReset());

describe('useConversationLookup', () => {
  it('resolves wsId→conversationId via the read-only lookup (never creates)', async () => {
    lookup.mockResolvedValue({ ok: true, conversationId: 'conv-1' });
    const { result } = renderHook(() => useConversationLookup('ws-1', true));
    expect(result.current.conversationId).toBeUndefined(); // loading

    await waitFor(() => expect(result.current.conversationId).toBe('conv-1'));
    expect(lookup).toHaveBeenCalledWith('ws-1');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('null conversationId means "no conversation yet" (new-conversation composer)', async () => {
    lookup.mockResolvedValue({ ok: true, conversationId: null });
    const { result } = renderHook(() => useConversationLookup('ws-1', true));
    await waitFor(() => expect(result.current.conversationId).toBeNull());
  });

  it('does not look up when disabled (e.g. team tab active)', () => {
    const { result } = renderHook(() => useConversationLookup('ws-1', false));
    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.conversationId).toBeUndefined();
  });

  it('a failed lookup sets resolveFailed; retry clears it and re-resolves', async () => {
    lookup.mockResolvedValueOnce({ ok: false, error: 'X' });
    const { result } = renderHook(() => useConversationLookup('ws-1', true));
    await waitFor(() => expect(result.current.resolveFailed).toBe(true));

    lookup.mockResolvedValueOnce({ ok: true, conversationId: 'conv-2' });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.conversationId).toBe('conv-2'));
  });

  it('markCreated sets the conversation id (first-send path)', () => {
    const { result } = renderHook(() => useConversationLookup('ws-1', false));
    act(() => result.current.markCreated('ws-1', 'conv-new'));
    expect(result.current.conversationId).toBe('conv-new');
  });
});
