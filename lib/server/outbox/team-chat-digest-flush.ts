// flushTeamChatDigests — dedicated processor for delayed team_chat.message
// digest rows. Mirrors chat-digest-flush.ts but scoped to a team thread keyed by
// (rfpId, workspaceId, recipientUserId) rather than a single conversation id.
//
// TeamChatService.sendMessage enqueues ONE coalesced outbox row per (rfp,
// workspace, recipient) window, scheduled at the window END, with a placeholder
// body. The generic outbox flush deliberately skips event='team_chat.message'
// (see outbox.ts), so this processor owns those rows. It recomputes the digest
// body at SEND time so the mail reflects the true state when it actually goes out:
//
//   recompute — body = "N건" unread count + latest preview + author name, NOT
//               the stored placeholder.
//   read      — recipient has read everything (N === 0) → cancel (no mail).
//
// "Unread" counts only NON-SELF messages newer than the recipient's last_read_at
// (a team thread is single-sided — no counterparty axis like buyer↔PG chat).
// There is no presence layer: team threads aren't live-presence-tracked the way
// buyer↔PG conversations are, so the digest relies on read-state alone.
//
// Cancel = markResult sent with no sender call. Malformed dedupeKey → also
// markResult sent so a junk row can't wedge the queue.

import {
  getOutboxRepo,
  getRfpTeamMessageRepo,
  getRfpTeamMessageReadRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { parseTeamDigestDedupeKey } from './team-digest';
import { mentionsToPlainText } from '@/lib/team-mentions';
import { baseUrlFor } from '@/lib/server/env';
import { renderChatMessage } from './templates/chatMessage';
import type { Sender } from './types';

const PREVIEW_LEN = 120;
const EMPTY_PREVIEW = '첨부 파일';

/**
 * Drain due team-chat-digest outbox rows through `sender`, recomputing each body
 * at send time. Returns counts: `sent` = mail actually dispatched, `cancelled` =
 * rows resolved without a mail (already-read / malformed).
 */
export async function flushTeamChatDigests(
  sender: Sender,
  limit: number = 50,
): Promise<{ sent: number; cancelled: number; failed: number }> {
  const outbox = await getOutboxRepo();
  const msgRepo = await getRfpTeamMessageRepo();
  const readRepo = await getRfpTeamMessageReadRepo();
  const wsRepo = await getWorkspaceRepo();

  const due = await outbox.dueTeamChatDigests(limit);

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const entry of due) {
    const parsed = parseTeamDigestDedupeKey(entry.dedupeKey);
    if (!parsed) {
      // Junk row — resolve it so it can't recur forever.
      await outbox.markResult(entry.id, { ok: true });
      cancelled++;
      continue;
    }
    const { rfpId, workspaceId, recipientUserId } = parsed;

    // Read short-circuit — count team messages the recipient hasn't read,
    // excluding the recipient's own posts. The same query yields N + latest
    // preview + author name.
    const read = await readRepo.getFor(rfpId, workspaceId, recipientUserId);
    const lastReadAt = read?.lastReadAt;
    const messages = await msgRepo.listByScope(rfpId, workspaceId);
    const unread = messages.filter(
      (m) =>
        m.authorUserId !== recipientUserId &&
        (!lastReadAt || m.createdAt > lastReadAt),
    );

    if (unread.length === 0) {
      await outbox.markResult(entry.id, { ok: true });
      cancelled++;
      continue;
    }

    // Recompute the digest body from the unread messages.
    const latest = unread[unread.length - 1];
    const roster = await wsRepo.teamRoster(workspaceId);
    const nameById = new Map(roster.map((r) => [r.userId, r.name]));
    const latestPlain = mentionsToPlainText(latest.body, nameById);
    const preview =
      latestPlain.length > 0 ? latestPlain.slice(0, PREVIEW_LEN) : EMPTY_PREVIEW;
    const senderName = latest.authorName.length > 0 ? latest.authorName : '팀원';
    const ws = await wsRepo.findById(workspaceId);
    const origin = baseUrlFor(ws?.type === 'pg' ? 'pg' : 'buyer');
    const html = await renderChatMessage({
      senderName,
      preview,
      conversationUrl: `${origin}/messages?t=${rfpId}`,
      count: unread.length,
    });
    const subject =
      unread.length >= 2
        ? `[Supporter B] ${senderName}님의 팀 메시지 ${unread.length}건`
        : `[Supporter B] ${senderName}님의 팀 메시지`;

    // Send the RECOMPUTED body (not the stored placeholder).
    const result = await sender({ ...entry, subject, html });
    if (result.ok) {
      await outbox.markResult(entry.id, { ok: true });
      sent++;
    } else {
      await outbox.markResult(entry.id, { ok: false, error: result.error ?? 'unknown' });
      failed++;
    }
  }

  return { sent, cancelled, failed };
}
