import { describe, it, expect } from 'vitest';
import { buildHomeMessagesSnapshot } from '../homeMessages';
import type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';

function conv(overrides?: Partial<Extract<InboxListItem, { kind: 'counterparty' }>>): InboxListItem {
  return {
    kind: 'counterparty',
    key: 'c:conv-1',
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'ws-1', name: '회사', type: 'pg', logoUpdatedAt: null },
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

function keyOf(i: InboxListItem): string {
  return i.kind === 'counterparty' ? i.conversationId : i.rfpId;
}

describe('buildHomeMessagesSnapshot', () => {
  it('items without a lastMessageAt are excluded from the preview list', () => {
    const input: InboxListItem[] = [
      conv({ key: 'c:has-msg', conversationId: 'has-msg', lastMessageAt: '2026-06-06T10:00:00.000Z' }),
      conv({ key: 'c:no-msg', conversationId: 'no-msg', lastMessageAt: null }),
    ];
    const { items } = buildHomeMessagesSnapshot(input);
    expect(items.map(keyOf)).toEqual(['has-msg']);
  });

  it('unreadCount counts ALL items with unread=true, including those without messages', () => {
    const input: InboxListItem[] = [
      conv({ key: 'c:a', conversationId: 'a', unread: true, lastMessageAt: '2026-06-06T10:00:00.000Z' }),
      conv({ key: 'c:b', conversationId: 'b', unread: true, lastMessageAt: null }),
      conv({ key: 'c:c', conversationId: 'c', unread: false, lastMessageAt: '2026-06-06T11:00:00.000Z' }),
    ];
    const { unreadCount } = buildHomeMessagesSnapshot(input);
    expect(unreadCount).toBe(2);
  });

  it('includes team threads with a lastMessageAt and counts their unread', () => {
    const input: InboxListItem[] = [
      conv({ key: 'c:a', conversationId: 'a', lastMessageAt: '2026-06-06T10:00:00.000Z' }),
      {
        kind: 'team',
        key: 't:r1',
        rfpId: 'r1',
        rfpCode: 'P-1',
        rfpTitle: '제목',
        preview: '메모',
        lastMessageAt: '2026-06-06T11:00:00.000Z',
        unread: true,
      },
    ];
    const { items, unreadCount } = buildHomeMessagesSnapshot(input);
    expect(items.map(keyOf)).toEqual(['a', 'r1']);
    expect(unreadCount).toBe(1);
  });

  it('preserves the input sort order (caller-determined)', () => {
    const input: InboxListItem[] = [
      conv({ key: 'c:first', conversationId: 'first', lastMessageAt: '2026-06-06T12:00:00.000Z' }),
      conv({ key: 'c:second', conversationId: 'second', lastMessageAt: '2026-06-06T09:00:00.000Z' }),
    ];
    const { items } = buildHomeMessagesSnapshot(input);
    expect(items.map(keyOf)).toEqual(['first', 'second']);
  });

  it('returns an empty items list and zero unreadCount for an empty input', () => {
    const result = buildHomeMessagesSnapshot([]);
    expect(result).toEqual({ items: [], unreadCount: 0 });
  });
});
