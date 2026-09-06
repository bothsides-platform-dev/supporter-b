import {
  CHAT_DIGEST_WINDOW_MS,
  chatDigestBucket,
} from '@/lib/server/services/_chat-constants';

export { CHAT_DIGEST_WINDOW_MS, chatDigestBucket };

/**
 * Windowed dedupe key for one conversation recipient. The workspace segment
 * makes delivery identity explicit while the bucket coalesces a short burst.
 */
export function chatDigestDedupeKey(
  conversationId: string,
  recipientWorkspaceId: string,
  recipientUserId: string,
  now: Date = new Date(),
): string {
  return `chat-digest:${conversationId}:${recipientWorkspaceId}:${recipientUserId}:${chatDigestBucket(now)}`;
}

export function chatDigestWindowEnd(now: Date = new Date()): Date {
  return new Date((chatDigestBucket(now) + 1) * CHAT_DIGEST_WINDOW_MS);
}

/**
 * Legacy keys omit the workspace segment. The read-state projection accepts
 * that ambiguity only when membership resolves to exactly one conversation
 * side during a rolling deploy.
 */
export function parseChatDigestDedupeKey(
  dedupeKey: string | undefined,
): { conversationId: string; recipientWorkspaceId?: string; recipientUserId: string } | null {
  if (!dedupeKey) return null;
  const parts = dedupeKey.split(':');
  if (parts[0] !== 'chat-digest') return null;
  if (parts.length === 5) {
    const [, conversationId, recipientWorkspaceId, recipientUserId] = parts;
    if (!conversationId || !recipientWorkspaceId || !recipientUserId) return null;
    return { conversationId, recipientWorkspaceId, recipientUserId };
  }
  if (parts.length === 4) {
    const [, conversationId, recipientUserId] = parts;
    if (!conversationId || !recipientUserId) return null;
    return { conversationId, recipientUserId };
  }
  return null;
}
