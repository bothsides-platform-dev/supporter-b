import { randomUUID } from 'node:crypto';

import type {
  AttachmentRepo,
  ChatConversationRepo,
  ChatMessageRepo,
  ChatReadRepo,
  InvitationRepo,
  NotificationRepo,
  RfpRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { canWorkspaceAccessRfp } from '@/lib/server/rfp-access';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify, type NotifyChannel } from '@/lib/server/notifications/notify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderChatMessage } from '@/lib/server/outbox/templates/chatMessage';
import { isUserPresentInConversation } from '@/lib/server/realtime/centrifugo';
import type { Notification } from '@/lib/types/notification';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { ServiceResult } from './types';
import { CHAT_DIGEST_WINDOW_MS, chatDigestBucket } from './_chat-constants';

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
    private readonly readRepo: ChatReadRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly invRepo: InvitationRepo,
  ) {}

  async sendMessage(
    input: SendMessageInput,
    actor: ChatActor,
  ): Promise<
    ServiceResult<{
      conversationId: string;
      messageId: string;
      createdAt: string;
      authorName: string;
      authorEmail: string;
      rfpId: string | null;
    }>
  > {
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

    // Validate attachments are unlinked drafts uploaded by the sender.
    if (input.attachmentIds.length > 0) {
      for (const id of input.attachmentIds) {
        const att = await this.attRepo.findById(id);
        if (!att || att.rfpId || att.bidId || att.bidNoteId || att.chatMessageId) {
          return { ok: false, error: 'INVALID_ATTACHMENT' };
        }
        // 본인이 올린 미링크 첨부만 허용 — team-chat·bid-note 와 동일 기준.
        // (isMember 기준은 마스터/운영 임퍼소네이션 계정을 false 처리하는 버그였다:
        //  마스터는 workspace_members 행이 없어 자기가 올린 첨부도 거부됐다.)
        if (att.uploadedBy !== actor.userId) {
          return { ok: false, error: 'INVALID_ATTACHMENT' };
        }
      }
    }

    // RFP 태그 접근 검증 — 교차 테넌트 uuid 오염 방지. 검증 실패 시 태그만 드롭
    // (메시지는 정상 전송). tx 밖에서 실행해 불필요한 DB 락을 피한다.
    let effectiveRfpId: string | null = input.rfpId ?? null;
    if (effectiveRfpId) {
      const access = await canWorkspaceAccessRfp(this.rfpRepo, this.invRepo, effectiveRfpId, actor.workspaceId);
      if (!access.allowed) effectiveRfpId = null;
    }

    const now = new Date();
    const messageId = randomUUID();
    // 표시 전용 — 보낸 사람 이름/이메일(라이브 수신자가 메시지에 라벨을 붙인다).
    const me = await this.userRepo.findById(actor.userId);
    const pendingEmits: Notification[] = [];

    const result: ServiceResult<{
      conversationId: string;
      messageId: string;
      createdAt: string;
      authorName: string;
      authorEmail: string;
      rfpId: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }> = await this._db.transaction(async (tx: any) => {
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
          rfpId: effectiveRfpId,
          createdAt: now,
        },
        tx,
      );

      if (input.attachmentIds.length > 0) {
        await this.attRepo.claim(
          { ids: input.attachmentIds, owner: { chatMessageId: messageId } },
          tx,
        );
      }

      await this.convRepo.touchLastMessageAt(conv.id, now, tx);

      const senderName = (await this.wsRepo.getName(actor.workspaceId, tx)) ?? '상대';

      const recipients = await this.wsRepo.approvedMemberRecipients(counterpartyWsId, tx);

      const preview = body.length > 0 ? body.slice(0, 120) : '첨부 파일을 보냈어요.';
      const conversationUrl = `${BASE_URL}/messages`;
      const html = await renderChatMessage({ senderName, preview, conversationUrl });

      const digestScheduledAt = chatDigestWindowEnd(now);
      const inappWindowStart = new Date(chatDigestBucket(now) * CHAT_DIGEST_WINDOW_MS);

      for (const m of recipients) {
        if (m.userId === actor.userId) continue;

        const channels: NotifyChannel[] = [];
        const alreadyNotified = await this.notifRepo.hasPendingChatNotification(
          m.userId,
          counterpartyWsId,
          inappWindowStart,
          tx,
        );
        if (!alreadyNotified) channels.push('inapp');
        const present = await isUserPresentInConversation(conv.id, m.userId);
        if (!present) channels.push('email');

        pendingEmits.push(
          ...(await notify(tx, {
            recipients: [{ userId: m.userId, workspaceId: counterpartyWsId, email: m.email }],
            channels,
            type: 'chat.message',
            title: `${senderName}님의 새 메시지`,
            body: preview,
            linkUrl: '/messages',
            email: {
              event: 'chat.message',
              subject: `[서포트비] ${senderName}님의 새 메시지`,
              html,
              dedupeKey: () => chatDigestDedupeKey(conv.id, m.userId, now),
              scheduledAt: digestScheduledAt,
            },
          })),
        );
      }

      return {
        ok: true as const,
        conversationId: conv.id,
        messageId,
        // 서버 권위 타임스탬프 — 클라이언트가 낙관적 말풍선을 확정으로 승격할 때
        // 자기 시계 대신 이 값을 채택한다(리로드 후 로더 렌더와 일치).
        createdAt: now.toISOString(),
        authorName: me?.name ?? '',
        authorEmail: me?.email ?? '',
        rfpId: effectiveRfpId,
      };
    });

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  /**
   * 상대 워크스페이스와의 대화를 보장한다(없으면 생성). 메시지는 보내지 않는다 —
   * 결과 화면의 "메시지 시작" CTA가 빈 대화로 딥링크하기 위한 경로. buyer↔PG
   * 타입 불변식은 sendMessage와 동일하게 여기서 검증한다.
   */
  async getOrCreateConversation(
    counterpartyWorkspaceId: string,
    actor: ChatActor,
  ): Promise<ServiceResult<{ conversationId: string }>> {
    const counterparty = await this.wsRepo.findById(counterpartyWorkspaceId);
    if (!counterparty) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
    if (counterparty.type === actor.workspaceType) {
      return { ok: false, error: 'INVALID_COUNTERPARTY' };
    }
    const buyerWsId = actor.workspaceType === 'buyer' ? actor.workspaceId : counterpartyWorkspaceId;
    const pgWsId = actor.workspaceType === 'buyer' ? counterpartyWorkspaceId : actor.workspaceId;
    const conv = await this.convRepo.findOrCreatePair(buyerWsId, pgWsId);
    return { ok: true, conversationId: conv.id };
  }

  /**
   * 읽기 전용 페어 해소 — 없으면 conversationId null, **행을 생성하지 않는다**.
   * 채팅 레일 표시용: 열람·포커스 추종만으로 빈 대화를 만들면 상대 인박스에
   * "보고 있다"는 관심 신호가 새므로(sealed-bid), 생성은 첫 전송에만 맡긴다.
   */
  async findConversation(
    counterpartyWorkspaceId: string,
    actor: ChatActor,
  ): Promise<ServiceResult<{ conversationId: string | null }>> {
    const counterparty = await this.wsRepo.findById(counterpartyWorkspaceId);
    if (!counterparty) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
    if (counterparty.type === actor.workspaceType) {
      return { ok: false, error: 'INVALID_COUNTERPARTY' };
    }
    const buyerWsId = actor.workspaceType === 'buyer' ? actor.workspaceId : counterpartyWorkspaceId;
    const pgWsId = actor.workspaceType === 'buyer' ? counterpartyWorkspaceId : actor.workspaceId;
    const conv = await this.convRepo.findPair(buyerWsId, pgWsId);
    return { ok: true, conversationId: conv?.id ?? null };
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
        getChatReadRepo,
        getRfpRepo,
        getInvitationRepo,
      },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [convRepo, wsRepo, userRepo, attRepo, msgRepo, notifRepo, readRepo, rfpRepo, invRepo] =
      await Promise.all([
        getChatConversationRepo(),
        getWorkspaceRepo(),
        getUserRepo(),
        getAttachmentRepo(),
        getChatMessageRepo(),
        getNotificationRepo(),
        getChatReadRepo(),
        getRfpRepo(),
        getInvitationRepo(),
      ]);

    globalThis.__bidit_chat_service__ = new ChatService(
      db,
      convRepo,
      wsRepo,
      userRepo,
      attRepo,
      msgRepo,
      notifRepo,
      readRepo,
      rfpRepo,
      invRepo,
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
