import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { attachments, users, workspaceMembers, workspaces } from '@/lib/db/schema';
import type {
  AttachmentRepo,
  ChatConversationRepo,
  ChatMessageRepo,
  ChatReadRepo,
  NotificationRepo,
  OutboxRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderChatMessage } from '@/lib/server/outbox/templates/chatMessage';
import { isUserPresentInConversation } from '@/lib/server/realtime/centrifugo';
import type { Notification } from '@/lib/types/notification';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { ServiceResult } from './types';

export type ChatActor = {
  userId: string;
  workspaceId: string;
  workspaceType: WorkspaceType;
};

export type SendMessageInput = {
  conversationId?: string;
  counterpartyWorkspaceId?: string;
  counterpartyEmail?: string;
  body?: string;
  rfpId?: string;
  attachmentIds: string[];
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

const CHAT_DIGEST_WINDOW_MS = 3 * 60_000;

function chatDigestBucket(now: Date): number {
  return Math.floor(now.getTime() / CHAT_DIGEST_WINDOW_MS);
}

function chatDigestDedupeKey(conversationId: string, recipientUserId: string, now: Date): string {
  return `chat-digest:${conversationId}:${recipientUserId}:${chatDigestBucket(now)}`;
}

function chatDigestWindowEnd(now: Date): Date {
  return new Date((chatDigestBucket(now) + 1) * CHAT_DIGEST_WINDOW_MS);
}

export class ChatService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly convRepo: ChatConversationRepo,
    private readonly wsRepo: WorkspaceRepo,
    private readonly userRepo: UserRepo,
    private readonly attRepo: AttachmentRepo,
    private readonly msgRepo: ChatMessageRepo,
    private readonly notifRepo: NotificationRepo,
    private readonly outboxRepo: OutboxRepo,
    private readonly readRepo: ChatReadRepo,
  ) {}

  async sendMessage(
    input: SendMessageInput,
    actor: ChatActor,
  ): Promise<ServiceResult<{ conversationId: string; messageId: string }>> {
    const body = (input.body ?? '').trim();
    if (body.length === 0 && input.attachmentIds.length === 0) {
      return { ok: false, error: 'INVALID_INPUT' };
    }

    // ── Resolve the conversation ────────────────────────────────────────
    let buyerWsId: string;
    let pgWsId: string;
    let conversationId: string | undefined;

    if (input.conversationId) {
      const conv = await this.convRepo.findById(input.conversationId);
      if (!conv) return { ok: false, error: 'CONVERSATION_NOT_FOUND' };
      const myWsId = actor.workspaceType === 'buyer' ? conv.buyerWsId : conv.pgWsId;
      if (myWsId !== actor.workspaceId) return { ok: false, error: 'FORBIDDEN' };
      buyerWsId = conv.buyerWsId;
      pgWsId = conv.pgWsId;
      conversationId = conv.id;
    } else {
      let counterpartyWsId = input.counterpartyWorkspaceId;
      if (!counterpartyWsId && input.counterpartyEmail) {
        const user = await this.userRepo.findByEmail(input.counterpartyEmail);
        if (!user) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
        const memberships = await this.wsRepo.listForUser(user.id);
        const wantType = actor.workspaceType === 'buyer' ? 'pg' : 'buyer';
        const target = memberships.find((m) => m.type === wantType);
        if (!target) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
        counterpartyWsId = target.id;
      }
      if (!counterpartyWsId) return { ok: false, error: 'INVALID_INPUT' };

      const counterparty = await this.wsRepo.findById(counterpartyWsId);
      if (!counterparty) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
      if (counterparty.type === actor.workspaceType) {
        return { ok: false, error: 'INVALID_COUNTERPARTY' };
      }
      if (actor.workspaceType === 'buyer') {
        buyerWsId = actor.workspaceId;
        pgWsId = counterpartyWsId;
      } else {
        buyerWsId = counterpartyWsId;
        pgWsId = actor.workspaceId;
      }
    }

    const counterpartyWsId = actor.workspaceType === 'buyer' ? pgWsId : buyerWsId;

    // Validate attachments are unlinked drafts from a session-ws member.
    if (input.attachmentIds.length > 0) {
      for (const id of input.attachmentIds) {
        const att = await this.attRepo.findById(id);
        if (!att || att.rfpId || att.bidId || att.bidNoteId || att.chatMessageId) {
          return { ok: false, error: 'INVALID_ATTACHMENT' };
        }
        const uploaderIsMember = await this.wsRepo.isMember(att.uploadedBy, actor.workspaceId);
        if (!uploaderIsMember) return { ok: false, error: 'INVALID_ATTACHMENT' };
      }
    }

    const now = new Date();
    const messageId = randomUUID();
    const pendingEmits: Notification[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult<{ conversationId: string; messageId: string }> = await this._db.transaction(async (tx: any) => {
      const conv = conversationId
        ? { id: conversationId }
        : await this.convRepo.findOrCreatePair(buyerWsId, pgWsId, tx);

      await this.msgRepo.save(
        {
          id: messageId,
          conversationId: conv.id,
          authorUserId: actor.userId,
          authorWsId: actor.workspaceId,
          body,
          rfpId: input.rfpId ?? null,
          createdAt: now,
        },
        tx,
      );

      if (input.attachmentIds.length > 0) {
        await tx
          .update(attachments)
          .set({ chatMessageId: messageId })
          .where(
            and(
              inArray(attachments.id, input.attachmentIds),
              isNull(attachments.rfpId),
              isNull(attachments.bidId),
              isNull(attachments.bidNoteId),
              isNull(attachments.chatMessageId),
            ),
          );
      }

      await this.convRepo.touchLastMessageAt(conv.id, now, tx);

      const [senderRow] = (await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, actor.workspaceId))
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

      const preview = body.length > 0 ? body.slice(0, 120) : '첨부 파일을 보냈어요.';
      const conversationUrl = `${BASE_URL}/messages`;
      const html = await renderChatMessage({ senderName, preview, conversationUrl });

      const digestScheduledAt = chatDigestWindowEnd(now);
      const inappWindowStart = new Date(chatDigestBucket(now) * CHAT_DIGEST_WINDOW_MS);

      for (const m of recipients) {
        if (m.userId === actor.userId) continue;

        const alreadyNotified = await this.notifRepo.hasPendingChatNotification(
          m.userId,
          counterpartyWsId,
          inappWindowStart,
          tx,
        );
        if (!alreadyNotified) {
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
          await dispatchNotification(tx, notif);
          pendingEmits.push(notif);
        }

        if (await isUserPresentInConversation(conv.id, m.userId)) continue;

        await this.outboxRepo.enqueue(
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

      return { ok: true as const, conversationId: conv.id, messageId };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  async markConversationRead(
    conversationId: string,
    actor: ChatActor,
  ): Promise<ServiceResult<{ readAt: string }>> {
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) return { ok: false, error: 'CONVERSATION_NOT_FOUND' };

    const myWsId = actor.workspaceType === 'buyer' ? conv.buyerWsId : conv.pgWsId;
    if (myWsId !== actor.workspaceId) return { ok: false, error: 'FORBIDDEN' };

    const now = new Date();
    await this.readRepo.upsert(conv.id, actor.userId, now);

    return { ok: true, readAt: now.toISOString() };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_chat_service__: ChatService | undefined;
}

export async function getChatService(): Promise<ChatService> {
  if (!globalThis.__bidit_chat_service__) {
    const [
      { db },
      {
        getChatConversationRepo,
        getWorkspaceRepo,
        getUserRepo,
        getAttachmentRepo,
        getChatMessageRepo,
        getNotificationRepo,
        getOutboxRepo,
        getChatReadRepo,
      },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [convRepo, wsRepo, userRepo, attRepo, msgRepo, notifRepo, outboxRepo, readRepo] =
      await Promise.all([
        getChatConversationRepo(),
        getWorkspaceRepo(),
        getUserRepo(),
        getAttachmentRepo(),
        getChatMessageRepo(),
        getNotificationRepo(),
        getOutboxRepo(),
        getChatReadRepo(),
      ]);

    globalThis.__bidit_chat_service__ = new ChatService(
      db,
      convRepo,
      wsRepo,
      userRepo,
      attRepo,
      msgRepo,
      notifRepo,
      outboxRepo,
      readRepo,
    );
  }
  return globalThis.__bidit_chat_service__!;
}

export function __resetChatServiceForTest(): void {
  globalThis.__bidit_chat_service__ = undefined;
}

export function __setChatServiceForTest(service: ChatService): void {
  globalThis.__bidit_chat_service__ = service;
}
