import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useConversationReadReceipt } from '@/lib/chat/read-state/client';

const messages = [
  {
    id: 'sent-before',
    sender: 'self' as const,
    createdAt: '2026-09-05T10:00:00.000Z',
    readByCounterparty: false,
  },
  {
    id: 'sent-after',
    sender: 'self' as const,
    createdAt: '2026-09-05T12:00:00.000Z',
    readByCounterparty: false,
  },
];

describe('useConversationReadReceipt', () => {
  it('상대 workspace의 live watermark 이전 마지막 self 메시지를 표시한다', () => {
    const { result } = renderHook(() =>
      useConversationReadReceipt({
        conversationId: 'conversation-1',
        counterpartyWorkspaceId: 'pg-1',
        messages,
      }),
    );

    expect(result.current.receiptMessageId).toBeNull();

    act(() => {
      result.current.accept({
        type: 'read',
        userId: 'pg-user-1',
        workspaceId: 'pg-1',
        readAt: '2026-09-05T11:00:00.000Z',
      });
    });

    expect(result.current.receiptMessageId).toBe('sent-before');
  });

  it('내 workspace의 read event는 상대 읽음 영수증으로 받지 않는다', () => {
    const { result } = renderHook(() =>
      useConversationReadReceipt({
        conversationId: 'conversation-1',
        counterpartyWorkspaceId: 'pg-1',
        messages,
      }),
    );

    act(() => {
      result.current.accept({
        type: 'read',
        userId: 'buyer-teammate',
        workspaceId: 'buyer-1',
        readAt: '2026-09-05T13:00:00.000Z',
      });
    });

    expect(result.current.receiptMessageId).toBeNull();
  });

  it('늦게 도착한 오래된 live watermark가 영수증을 뒤로 돌리지 않는다', () => {
    const { result } = renderHook(() =>
      useConversationReadReceipt({
        conversationId: 'conversation-1',
        counterpartyWorkspaceId: 'pg-1',
        messages,
      }),
    );

    act(() => {
      result.current.accept({
        type: 'read',
        userId: 'pg-user-1',
        workspaceId: 'pg-1',
        readAt: '2026-09-05T13:00:00.000Z',
      });
      result.current.accept({
        type: 'read',
        userId: 'pg-user-1',
        workspaceId: 'pg-1',
        readAt: '2026-09-05T11:00:00.000Z',
      });
    });

    expect(result.current.receiptMessageId).toBe('sent-after');
  });

  it('잘못된 live timestamp가 이후의 정상 watermark를 오염시키지 않는다', () => {
    const { result } = renderHook(() =>
      useConversationReadReceipt({
        conversationId: 'conversation-1',
        counterpartyWorkspaceId: 'pg-1',
        messages,
      }),
    );

    act(() => {
      result.current.accept({
        type: 'read',
        userId: 'pg-user-1',
        workspaceId: 'pg-1',
        readAt: 'not-a-date',
      });
      result.current.accept({
        type: 'read',
        userId: 'pg-user-1',
        workspaceId: 'pg-1',
        readAt: '2026-09-05T13:00:00.000Z',
      });
    });

    expect(result.current.receiptMessageId).toBe('sent-after');
  });

  it('loader snapshot의 상대 읽음 영수증을 초기 projection에 반영한다', () => {
    const snapshotMessages = [
      { ...messages[0], readByCounterparty: true },
      messages[1],
    ];
    const { result } = renderHook(() =>
      useConversationReadReceipt({
        conversationId: 'conversation-1',
        counterpartyWorkspaceId: 'pg-1',
        messages: snapshotMessages,
      }),
    );

    expect(result.current.receiptMessageId).toBe('sent-before');
  });

  it('상대가 보낸 메시지에는 영수증을 표시하지 않는다', () => {
    const { result } = renderHook(() =>
      useConversationReadReceipt({
        conversationId: 'conversation-1',
        counterpartyWorkspaceId: 'pg-1',
        messages: [
          {
            id: 'received',
            sender: 'other',
            createdAt: '2026-09-05T10:00:00.000Z',
            readByCounterparty: true,
          },
        ],
      }),
    );

    expect(result.current.receiptMessageId).toBeNull();
  });

  it('conversation 또는 counterparty identity가 바뀌면 live watermark를 초기화한다', () => {
    const { result, rerender } = renderHook(
      ({ conversationId, counterpartyWorkspaceId }) =>
        useConversationReadReceipt({
          conversationId,
          counterpartyWorkspaceId,
          messages,
        }),
      {
        initialProps: {
          conversationId: 'conversation-1',
          counterpartyWorkspaceId: 'pg-1',
        },
      },
    );
    act(() => {
      result.current.accept({
        type: 'read',
        userId: 'pg-user-1',
        workspaceId: 'pg-1',
        readAt: '2026-09-05T13:00:00.000Z',
      });
    });
    expect(result.current.receiptMessageId).toBe('sent-after');

    rerender({
      conversationId: 'conversation-2',
      counterpartyWorkspaceId: 'pg-2',
    });

    expect(result.current.receiptMessageId).toBeNull();
  });
});
