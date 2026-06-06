import type { ConversationListItem } from '@/components/messages/types';

export type HomeMessagesSnapshot = {
  /** Conversations that have at least one message, in loader sort order. */
  conversations: ConversationListItem[];
  /** Unread count across ALL conversations (before the preview filter). */
  unreadCount: number;
};

/**
 * Shapes the inbox loader output into what the home messages widget needs.
 * Pure function — no I/O, no side effects.
 */
export function buildHomeMessagesSnapshot(
  conversations: ConversationListItem[],
): HomeMessagesSnapshot {
  return {
    conversations: conversations.filter((c) => c.lastMessageAt !== null),
    unreadCount: conversations.filter((c) => c.unread).length,
  };
}
