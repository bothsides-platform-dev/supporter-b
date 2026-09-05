// Shared helpers for the chat actions.
//
// Templates (`chat_message_templates`) are workspace-shared: any member of a
// workspace can save/list/delete that workspace's templates. The security
// invariant is cross-workspace isolation — enforced here via the active
// session workspace, mirroring board/_shared's requireActiveWorkspace +
// requireOwnedColumn pattern.
import { requireActiveWorkspace } from '@/lib/server/actions/_session';
export { requireActiveWorkspace };
import { getChatTemplateRepo } from '@/lib/server/repositories/factory';
import type { ChatMessageTemplate } from '@/lib/server/repositories/types';

import type { ActionResult } from '@/lib/server/actions/_result';

// Discriminated result, structurally identical to the bid/board action result.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ChatActionResult<T extends object = {}> = ActionResult<T>;

// Load a template owned by the session's active workspace (cross-workspace
// guard for delete). Returns TEMPLATE_NOT_FOUND when absent, FORBIDDEN when it
// belongs to another workspace.
export async function requireOwnedTemplate(
  templateId: string,
): Promise<
  | { ok: true; template: ChatMessageTemplate; workspaceId: string }
  | { ok: false; error: string }
> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  const template = await (await getChatTemplateRepo()).findById(templateId);
  if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
  if (template.workspaceId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  return { ok: true, template, workspaceId: ws.workspaceId };
}

// Email coalescing window — full IM is high-frequency, so one mail per message
// would be spam. Messages in the same WINDOW collapse to a single outbox row
// per recipient via a time-bucketed dedupe key. Putting the bucket IN the key
// (rather than narrowing the unique to status='pending') means a later window
// mints a fresh key, so coalescing self-heals after a previous digest is sent.
import { CHAT_DIGEST_WINDOW_MS, chatDigestBucket } from '@/lib/server/services/_chat-constants';
export { CHAT_DIGEST_WINDOW_MS, chatDigestBucket };

/** Windowed dedupe key — coalesces a window of messages into one mail per
 * recipient workspace member. Shape:
 * `chat-digest:<conversationId>:<recipientWorkspaceId>:<recipientUserId>:<bucket>`. */
export function chatDigestDedupeKey(
  conversationId: string,
  recipientWorkspaceId: string,
  recipientUserId: string,
  now: Date = new Date(),
): string {
  return `chat-digest:${conversationId}:${recipientWorkspaceId}:${recipientUserId}:${chatDigestBucket(now)}`;
}

/**
 * End of the window bucket containing `now` = `(bucket+1) * WINDOW`. This is the
 * `scheduledAt` for a coalesced digest: messages enqueued anywhere in the window
 * share this fire time, so the mail goes out once the window closes. Feed it the
 * SAME `now` passed to `chatDigestDedupeKey` so the key's bucket and the schedule
 * agree. */
export function chatDigestWindowEnd(now: Date = new Date()): Date {
  return new Date((chatDigestBucket(now) + 1) * CHAT_DIGEST_WINDOW_MS);
}

/**
 * Parse a chat-digest dedupeKey back into its workspace-scoped recipient.
 * UUIDs contain no colons, so a well-formed current key is exactly 5
 * colon-separated parts. Legacy 4-part keys are accepted with no workspace so
 * the flush can resolve only unambiguous memberships during a rolling deploy.
 * Returns
 * null on any malformed key (the flush processor treats that as "skip & mark
 * sent" so a junk row can't wedge the queue). */
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
