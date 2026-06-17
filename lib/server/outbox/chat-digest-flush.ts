// flushChatDigests — dedicated processor for delayed chat.message digest rows.
//
// sendChatMessageAction enqueues ONE coalesced outbox row per (conversation,
// recipient) window, scheduled at the window END, with a placeholder body. The
// generic outbox flush deliberately skips event='chat.message' (see
// outbox.ts), so this processor owns those rows. It recomputes the digest body
// at SEND time so the mail reflects the true state when it actually goes out:
//
//   layer 1 (presence) — recipient online NOW → cancel (no mail; they see live).
//   layer 3 (recompute) — body = "N건" unread count + latest preview + sender
//                          workspace name, NOT the stored placeholder.
//   layer 4 (read)      — recipient has read everything (N === 0) → cancel.
//
// Cancel = markResult sent with no sender call (the row is done; nothing to send).
// Malformed dedupeKey → also markResult sent so a junk row can't wedge the queue.
//
// Two-phase execution:
//   Phase 1 — recompute + filter: iterate due rows, cancel ineligible ones
//             immediately, accumulate eligible rows (subject + html recomputed)
//             into toSend[].
//   Phase 2 — batch send: pass all survivors to sendEntriesInBatches so the
//             entire tick's digests go out in ceil(N/100) Resend API calls
//             instead of N individual calls (rate-limit fix).

import {
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
  getOutboxRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { isUserPresentInConversation } from '@/lib/server/realtime/centrifugo';
import { parseChatDigestDedupeKey } from '@/lib/server/actions/chat/_shared';
import { baseUrlFor } from '@/lib/server/env';
import { computeBackoff } from './backoff';
import { sendEntriesInBatches } from './batch-send';
import { renderChatMessage } from './templates/chatMessage';
import type { BatchSender, OutboxEntry } from './types';

const PREVIEW_LEN = 120;
const EMPTY_PREVIEW = '첨부 파일을 보냈어요.';

/**
 * Drain due chat-digest outbox rows through `batchSender`, recomputing each
 * body at send time. Survivors are batched into ceil(N/100) Resend API calls.
 * Returns counts: `sent` = mail dispatched, `cancelled` = resolved without mail,
 * `failed` = transiently failed and rescheduled.
 */
export async function flushChatDigests(
  batchSender: BatchSender,
  limit: number = 50,
): Promise<{ sent: number; cancelled: number; failed: number }> {
  const outbox = await getOutboxRepo();
  const convRepo = await getChatConversationRepo();
  const msgRepo = await getChatMessageRepo();
  const readRepo = await getChatReadRepo();
  const wsRepo = await getWorkspaceRepo();

  const due = await outbox.dueChatDigests(limit);

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  // Phase 1 — recompute + filter.
  const toSend: Array<{ entry: OutboxEntry; subject: string; html: string }> = [];

  for (const entry of due) {
    const parsed = parseChatDigestDedupeKey(entry.dedupeKey);
    if (!parsed) {
      await outbox.markResult(entry.id, { ok: true });
      cancelled++;
      continue;
    }
    const { conversationId, recipientUserId } = parsed;

    // Layer 1 — presence re-check: online now → they see the live fanout.
    if (await isUserPresentInConversation(conversationId, recipientUserId)) {
      await outbox.markResult(entry.id, { ok: true });
      cancelled++;
      continue;
    }

    const conv = await convRepo.findById(conversationId);
    if (!conv) {
      await outbox.markResult(entry.id, { ok: true });
      cancelled++;
      continue;
    }
    const recipientOnBuyerSide = await wsRepo.isMember(
      recipientUserId,
      conv.buyerWsId,
    );
    const counterpartyWsId = recipientOnBuyerSide ? conv.pgWsId : conv.buyerWsId;

    // Layer 4 — read short-circuit: count COUNTERPARTY messages the recipient
    // hasn't read. Filtering by authorWsId (side), not authorUserId, excludes
    // both the recipient's own messages AND same-side teammates.
    const readRow = await readRepo.getFor(conversationId, recipientUserId);
    const lastReadAt = readRow?.lastReadAt;
    const messages = await msgRepo.listByConversation(conversationId);
    const unread = messages.filter(
      (m) =>
        m.authorWsId === counterpartyWsId &&
        (!lastReadAt || m.createdAt > lastReadAt),
    );

    if (unread.length === 0) {
      await outbox.markResult(entry.id, { ok: true });
      cancelled++;
      continue;
    }

    // Layer 3 — recompute the digest body from the unread messages.
    const latest = unread[unread.length - 1];
    const preview =
      latest.body.length > 0 ? latest.body.slice(0, PREVIEW_LEN) : EMPTY_PREVIEW;
    const senderWs = await wsRepo.findById(latest.authorWsId);
    const senderName = senderWs?.name ?? '상대';
    const html = await renderChatMessage({
      senderName,
      preview,
      conversationUrl: `${baseUrlFor(recipientOnBuyerSide ? 'buyer' : 'pg')}/messages`,
      count: unread.length,
    });
    const subject =
      unread.length >= 2
        ? `[Supporter B] ${senderName}님의 새 메시지 ${unread.length}건`
        : `[Supporter B] ${senderName}님의 새 메시지`;

    toSend.push({ entry, subject, html });
  }

  // Phase 2 — batch-send all survivors.
  if (toSend.length > 0) {
    const enriched = toSend.map(({ entry, subject, html }) => ({
      ...entry,
      subject,
      html,
    }));
    const results = await sendEntriesInBatches(batchSender, enriched);
    for (let i = 0; i < toSend.length; i++) {
      const result = results[i];
      const { entry } = toSend[i];
      if (result.ok) {
        await outbox.markResult(entry.id, { ok: true });
        sent++;
      } else {
        const nextScheduledAt =
          result.retryable === false
            ? undefined
            : new Date(
                Date.now() +
                  computeBackoff(entry.attempts + 1, {
                    retryAfterMs: result.retryAfterMs,
                  }),
              );
        await outbox.markResult(entry.id, {
          ok: false,
          error: result.error ?? 'unknown',
          retryable: result.retryable,
          nextScheduledAt,
        });
        failed++;
      }
    }
  }

  return { sent, cancelled, failed };
}
