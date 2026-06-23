// Shared helpers for the chat actions.
//
// Templates (`chat_message_templates`) are workspace-shared: any member of a
// workspace can save/list/delete that workspace's templates. The security
// invariant is cross-workspace isolation — enforced here via the active
// session workspace, mirroring board/_shared's requireActiveWorkspace +
// requireOwnedColumn pattern.
import { requireSession } from '@/lib/auth/session';
import { getChatTemplateRepo } from '@/lib/server/repositories/factory';
import type { ChatMessageTemplate } from '@/lib/server/repositories/types';
import type { WorkspaceType } from '@/lib/types/workspace';

// actionDb()/baseUrl() are reused from auth/_shared (same pglite-injectable
// handle the other action trees use).
export { actionDb, baseUrl } from '../auth/_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

// Discriminated result, structurally identical to the bid/board action result.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ChatActionResult<T extends object = {}> = ActionResult<T>;

// The session's active workspace, for any-workspace-type chat actions.
export async function requireActiveWorkspace(): Promise<
  | { ok: true; userId: string; workspaceId: string; workspaceType: WorkspaceType }
  | { ok: false; error: string }
> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const { id, workspaceId, workspaceType } = session.user;
  if (!workspaceId || !workspaceType) return { ok: false, error: 'NO_WORKSPACE' };
  return { ok: true, userId: id, workspaceId, workspaceType };
}

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
 *  recipient. Shape: `chat-digest:<conversationId>:<recipientUserId>:<bucket>`. */
export function chatDigestDedupeKey(
  conversationId: string,
  recipientUserId: string,
  now: Date = new Date(),
): string {
  return `chat-digest:${conversationId}:${recipientUserId}:${chatDigestBucket(now)}`;
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
 * Parse a chat-digest dedupeKey back into its `(conversationId, recipientUserId)`.
 * Shape: `chat-digest:<conversationId>:<recipientUserId>:<bucket>`. UUIDs contain
 * no colons, so a well-formed key is exactly 4 colon-separated parts. Returns
 * null on any malformed key (the flush processor treats that as "skip & mark
 * sent" so a junk row can't wedge the queue). */
export function parseChatDigestDedupeKey(
  dedupeKey: string | undefined,
): { conversationId: string; recipientUserId: string } | null {
  if (!dedupeKey) return null;
  const parts = dedupeKey.split(':');
  if (parts.length !== 4 || parts[0] !== 'chat-digest') return null;
  const [, conversationId, recipientUserId] = parts;
  if (!conversationId || !recipientUserId) return null;
  return { conversationId, recipientUserId };
}
