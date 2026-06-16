import { describe, it, expect } from 'vitest';
import { buildHomeMessagesSnapshot } from '../homeMessages';
import type { ConversationListItem } from '@/components/messages/types';

function conv(overrides?: Partial<ConversationListItem>): ConversationListItem {
  return {
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'ws-1', name: '회사', type: 'pg', hasLogo: false },
    rfpId: null,
    rfpCode: null,
    rfpTitle: null,
    rfpStatus: null,
    rfpDeadline: null,
    preview: '안녕하세요',
    lastMessageAt: '2026-06-06T10:00:00.000Z',
    unread: false,
    ...overrides,
  };
}

describe('buildHomeMessagesSnapshot', () => {
  it('conversations without a lastMessageAt are excluded from the preview list', () => {
    const input = [
      conv({ conversationId: 'has-msg', lastMessageAt: '2026-06-06T10:00:00.000Z' }),
      conv({ conversationId: 'no-msg', lastMessageAt: null }),
    ];
    const { conversations } = buildHomeMessagesSnapshot(input);
    expect(conversations.map((c) => c.conversationId)).toEqual(['has-msg']);
  });

  it('unreadCount counts ALL conversations with unread=true, including those without messages', () => {
    const input = [
      conv({ conversationId: 'a', unread: true, lastMessageAt: '2026-06-06T10:00:00.000Z' }),
      conv({ conversationId: 'b', unread: true, lastMessageAt: null }),
      conv({ conversationId: 'c', unread: false, lastMessageAt: '2026-06-06T11:00:00.000Z' }),
    ];
    const { unreadCount } = buildHomeMessagesSnapshot(input);
    expect(unreadCount).toBe(2);
  });

  it('preserves the input sort order (caller-determined)', () => {
    const input = [
      conv({ conversationId: 'first', lastMessageAt: '2026-06-06T12:00:00.000Z' }),
      conv({ conversationId: 'second', lastMessageAt: '2026-06-06T09:00:00.000Z' }),
    ];
    const { conversations } = buildHomeMessagesSnapshot(input);
    expect(conversations.map((c) => c.conversationId)).toEqual(['first', 'second']);
  });

  it('returns an empty conversations list and zero unreadCount for an empty input', () => {
    const result = buildHomeMessagesSnapshot([]);
    expect(result).toEqual({ conversations: [], unreadCount: 0 });
  });
});
