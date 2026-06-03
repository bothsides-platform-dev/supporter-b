'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { attachments, users, workspaces, workspaceMembers } from '@/lib/db/schema';
import {
  getAttachmentRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getOutboxRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderChatMessage } from '@/lib/server/outbox/templates/chatMessage';
import {
  isUserPresentInConversation,
  publishChatEvent,
} from '@/lib/server/realtime/centrifugo';
import type { Notification } from '@/lib/types/notification';
import {
  actionDb,
  baseUrl,
  chatDigestDedupeKey,
  chatDigestWindowEnd,
  type ChatActionResult,
  requireActiveWorkspace,
} from './_shared';

const Input = z
  .object({
    conversationId: z.string().uuid().optional(),
    counterpartyWorkspaceId: z.string().uuid().optional(),
    counterpartyEmail: z.string().email().optional(),
    body: z.string().max(4000).optional().default(''),
    rfpId: z.string().uuid().optional(),
    attachmentIds: z.array(z.string().uuid()).max(5).optional().default([]),
  })
  .strict();

export type SendChatMessageInput = z.input<typeof Input>;
export type SendChatMessageResult = ChatActionResult<{
  conversationId: string;
  messageId: string;
}>;

/**
 * Send a chat message — buyer & PG both call this; the sending side is derived
 * from `session.user.workspaceType`. Resolves the conversation by id (membership
 * checked), by counterparty workspace id, or by counterparty email (cold contact
 * — no accept gate). buyer↔PG only: a same-type counterparty is rejected,
 * preserving the complete-privacy invariant.
 */
export async function sendChatMessageAction(
  input: SendChatMessageInput,
): Promise<SendChatMessageResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const data = parsed.data;

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const body = data.body.trim();
  if (body.length === 0 && data.attachmentIds.length === 0) {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  const convRepo = await getChatConversationRepo();
  const wsRepo = await getWorkspaceRepo();

  // ── Resolve the conversation ────────────────────────────────────────
  let buyerWsId: string;
  let pgWsId: string;
  let conversationId: string | undefined;

  if (data.conversationId) {
    const conv = await convRepo.findById(data.conversationId);
    if (!conv) return { ok: false, error: 'CONVERSATION_NOT_FOUND' };
    // Membership ACL: the session workspace must be the conversation's own side.
    const myWsId = ws.workspaceType === 'buyer' ? conv.buyerWsId : conv.pgWsId;
    if (myWsId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };
    buyerWsId = conv.buyerWsId;
    pgWsId = conv.pgWsId;
    conversationId = conv.id;
  } else {
    // Resolve the counterparty workspace from id or email (cold contact).
    let counterpartyWsId = data.counterpartyWorkspaceId;
    if (!counterpartyWsId && data.counterpartyEmail) {
      const user = await (await getUserRepo()).findByEmail(data.counterpartyEmail);
      if (!user) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
      const memberships = await wsRepo.listForUser(user.id);
      // Pick the counterparty's workspace of the OPPOSITE type to the sender.
      const wantType = ws.workspaceType === 'buyer' ? 'pg' : 'buyer';
      const target = memberships.find((m) => m.type === wantType);
      if (!target) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
      counterpartyWsId = target.id;
    }
    if (!counterpartyWsId) return { ok: false, error: 'INVALID_INPUT' };

    const counterparty = await wsRepo.findById(counterpartyWsId);
    if (!counterparty) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
    // buyer↔PG only — reject same-type counterparty.
    if (counterparty.type === ws.workspaceType) {
      return { ok: false, error: 'INVALID_COUNTERPARTY' };
    }
    if (ws.workspaceType === 'buyer') {
      buyerWsId = ws.workspaceId;
      pgWsId = counterpartyWsId;
    } else {
      buyerWsId = counterpartyWsId;
      pgWsId = ws.workspaceId;
    }
  }

  const counterpartyWsId = ws.workspaceType === 'buyer' ? pgWsId : buyerWsId;

  // Validate attachments are unlinked drafts uploaded by a session-ws member.
  if (data.attachmentIds.length > 0) {
    const attRepo = await getAttachmentRepo();
    for (const id of data.attachmentIds) {
      const att = await attRepo.findById(id);
      if (!att || att.rfpId || att.bidId || att.bidNoteId || att.chatMessageId) {
        return { ok: false, error: 'INVALID_ATTACHMENT' };
      }
      const uploaderIsMember = await wsRepo.isMember(att.uploadedBy, ws.workspaceId);
      if (!uploaderIsMember) return { ok: false, error: 'INVALID_ATTACHMENT' };
    }
  }

  const msgRepo = await getChatMessageRepo();
  const db = actionDb();
  const now = new Date();
  const messageId = randomUUID();
  const pendingEmits: Notification[] = [];

  const result: SendChatMessageResult = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<SendChatMessageResult> => {
      // findOrCreatePair is idempotent on the pair unique.
      const conv = conversationId
        ? { id: conversationId }
        : await convRepo.findOrCreatePair(buyerWsId, pgWsId, tx);

      await msgRepo.save(
        {
          id: messageId,
          conversationId: conv.id,
          authorUserId: ws.userId,
          authorWsId: ws.workspaceId,
          body,
          rfpId: data.rfpId ?? null,
          createdAt: now,
        },
        tx,
      );

      if (data.attachmentIds.length > 0) {
        await tx
          .update(attachments)
          .set({ chatMessageId: messageId })
          .where(
            and(
              inArray(attachments.id, data.attachmentIds),
              isNull(attachments.rfpId),
              isNull(attachments.bidId),
              isNull(attachments.bidNoteId),
              isNull(attachments.chatMessageId),
            ),
          );
      }

      await convRepo.touchLastMessageAt(conv.id, now, tx);

      // Sender label + counterparty members for the fanout.
      const [senderRow] = (await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, ws.workspaceId))
        .limit(1)) as { name: string }[];
      const senderName = senderRow?.name ?? '상대';

      const recipients = (await tx
        .select({ userId: workspaceMembers.userId, email: users.email })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, counterpartyWsId))) as {
        userId: string;
        email: string;
      }[];

      const outbox = await getOutboxRepo();
      const preview = body.length > 0 ? body.slice(0, 120) : '첨부 파일을 보냈어요.';
      const conversationUrl = `${baseUrl()}/messages`;
      const html = await renderChatMessage({ senderName, preview, conversationUrl });

      // scheduledAt for every coalesced digest in this window — shared so a
      // flurry lands on one fire time (the window END).
      const digestScheduledAt = chatDigestWindowEnd(now);

      for (const m of recipients) {
        // sender's own membership never lands in counterparty fanout, but guard
        // anyway in case of shared membership edge cases.
        if (m.userId === ws.userId) continue;
        const notif: Notification = {
          id: randomUUID(),
          userId: m.userId,
          workspaceId: counterpartyWsId,
          type: 'chat.message',
          title: `${senderName}님의 새 메시지`,
          body: preview,
          channel: 'inapp',
          status: 'pending',
          linkUrl: '/messages',
          createdAt: now.toISOString(),
        };
        // In-app bell ALWAYS fires (online or not).
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);

        // Layer 1 — presence suppression: an online recipient sees the live
        // fanout, so skip the email enqueue entirely. Best-effort & defaults to
        // offline when Centrifugo is unconfigured, so we never silently drop a
        // mail a recipient actually needs.
        if (await isUserPresentInConversation(conv.id, m.userId)) continue;

        // Layer 2 — windowed coalesce: a flurry in one window collapses to a
        // single outbox row (dedupeKey holds the time bucket; ON CONFLICT DO
        // NOTHING). scheduledAt = window END so the mail fires once the window
        // closes; the body (preview/count) is recomputed at flush time, so the
        // html enqueued here is only a placeholder for the single-message case.
        await outbox.enqueue(
          {
            event: 'chat.message',
            to: m.email,
            subject: `[Supporter B] ${senderName}님의 새 메시지`,
            html,
            dedupeKey: chatDigestDedupeKey(conv.id, m.userId, now),
            scheduledAt: digestScheduledAt,
          },
          tx,
        );
      }

      return { ok: true, conversationId: conv.id, messageId };
    },
  );

  if (result.ok) {
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
    // Best-effort live fanout — never blocks the send. Content-bearing so a
    // subscriber can append straight to its thread (sender derived from
    // authorWsId) without a refetch round-trip.
    await publishChatEvent(result.conversationId, {
      type: 'message',
      id: result.messageId,
      body,
      authorWsId: ws.workspaceId,
      rfpId: data.rfpId ?? null,
      createdAt: now.toISOString(),
    });
  }
  return result;
}
