import type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';

export type HomeMessagesSnapshot = {
  /** Inbox items (counterparty + team) that have at least one message, in loader sort order. */
  items: InboxListItem[];
  /** Unread count across ALL items (before the preview filter). */
  unreadCount: number;
};

/**
 * Shapes the inbox loader output into what the home messages widget needs.
 * Pure function — no I/O, no side effects.
 */
export function buildHomeMessagesSnapshot(
  items: InboxListItem[],
): HomeMessagesSnapshot {
  return {
    items: items.filter((i) => i.lastMessageAt !== null),
    unreadCount: items.filter((i) => i.unread).length,
  };
}
