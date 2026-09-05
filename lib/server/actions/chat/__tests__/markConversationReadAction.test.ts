import { beforeEach, describe, expect, it, vi } from 'vitest';

const { markRead, publishChatEvent, requireActiveWorkspace } = vi.hoisted(() => ({
  markRead: vi.fn(),
  publishChatEvent: vi.fn(),
  requireActiveWorkspace: vi.fn(),
}));

vi.mock('../_shared', () => ({
  requireActiveWorkspace,
}));

vi.mock('@/lib/chat/read-state/server', () => ({
  getConversationReadState: vi.fn().mockResolvedValue({ markRead }),
}));

vi.mock('@/lib/server/realtime/centrifugo', () => ({ publishChatEvent }));

import { markConversationReadAction } from '../markConversationReadAction';

describe('markConversationReadAction', () => {
  beforeEach(() => {
    markRead.mockReset();
    markRead.mockResolvedValue({
      ok: true,
      readAt: '2026-09-05T12:00:00.000Z',
    });
    publishChatEvent.mockReset();
    requireActiveWorkspace.mockReset();
    requireActiveWorkspace.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      workspaceId: 'workspace-1',
      workspaceType: 'buyer',
    });
  });

  it('인증된 viewer를 Conversation read state module에 위임한다', async () => {
    const result = await markConversationReadAction({
      conversationId: '00000000-0000-4000-8000-000000000001',
    });

    expect(result).toEqual({
      ok: true,
      readAt: '2026-09-05T12:00:00.000Z',
    });
    expect(markRead).toHaveBeenCalledWith({
      conversationId: '00000000-0000-4000-8000-000000000001',
      viewer: { userId: 'user-1', activeWorkspaceId: 'workspace-1' },
    });
    expect(publishChatEvent).not.toHaveBeenCalled();
  });

  it.each([
    [{ conversationId: 'not-a-uuid' }],
    [
      {
        conversationId: '00000000-0000-4000-8000-000000000001',
        unexpected: true,
      },
    ],
  ])('잘못된 입력 %j은 module 호출 전에 거부한다', async (input) => {
    const result = await markConversationReadAction(input as never);

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(requireActiveWorkspace).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();
  });

  it('active workspace 확인이 실패하면 module을 호출하지 않는다', async () => {
    requireActiveWorkspace.mockResolvedValueOnce({
      ok: false,
      error: 'UNAUTHENTICATED',
    });

    const result = await markConversationReadAction({
      conversationId: '00000000-0000-4000-8000-000000000001',
    });

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(markRead).not.toHaveBeenCalled();
  });
});
