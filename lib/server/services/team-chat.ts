import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { attachments } from '@/lib/db/schema';
import type { Attachment } from '@/lib/types/common';
import type {
  InvitationRepo,
  NotificationRepo,
  RfpRepo,
  RfpTeamMessageReadRepo,
  RfpTeamMessageRepo,
  RfpTeamMessageWithAuthor,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { ServiceResult } from './types';

// 인앱 알림 dedupe 윈도 — ChatService 와 동일한 3분 버킷(채팅 digest 패턴 미러).
// 액션 레이어(`actions/chat/_shared`)의 동명 헬퍼와 값은 같지만, 서비스가
// 액션을 import 하면 next-auth(requireSession) 까지 끌려와 vitest 수집이 깨지므로
// 여기서 로컬로 정의한다(ChatService 도 동일하게 자체 정의).
const CHAT_DIGEST_WINDOW_MS = 3 * 60_000;
function chatDigestBucket(now: Date): number {
  return Math.floor(now.getTime() / CHAT_DIGEST_WINDOW_MS);
}

export type TeamChatActor = {
  userId: string;
  workspaceId: string;
  workspaceType: WorkspaceType;
};

export type TeamThreadEntry = {
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  preview: string;
  lastMessageAt: string;
  unread: boolean;
};

// RFP-scoped internal team thread (v1: no mentions/notifications/read-state —
// 확정 결정). Supports PDF/image attachments (absorbed the per-bid memo). NOT
// part of ChatService: that service owns buyer↔PG pair resolution and
// notification fanout, none of which apply here. ACL mirrors the page loaders:
// buyer must own the RFP, PG must hold an invitation (invRepo.canAccess — same
// gate as loadPgRfpDetail). sendMessage re-parents draft attachments in one
// transaction (BidService.addNote pattern); list/insert stay append-only.
export class TeamChatService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly rfpRepo: RfpRepo,
    private readonly invRepo: InvitationRepo,
    private readonly userRepo: UserRepo,
    private readonly msgRepo: RfpTeamMessageRepo,
    private readonly readRepo: RfpTeamMessageReadRepo,
    private readonly wsRepo: WorkspaceRepo,
    private readonly notifRepo: NotificationRepo,
  ) {}

  private async authorize(
    rfpId: string,
    actor: TeamChatActor,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if (actor.workspaceType === 'buyer') {
      if (rfp.buyerWsId !== actor.workspaceId) {
        return { ok: false, error: 'FORBIDDEN' };
      }
      return { ok: true };
    }
    const allowed = await this.invRepo.canAccess(rfpId, actor.workspaceId);
    return allowed ? { ok: true } : { ok: false, error: 'FORBIDDEN' };
  }

  async sendMessage(
    input: { rfpId: string; body: string; attachmentIds?: string[] },
    actor: TeamChatActor,
  ): Promise<
    ServiceResult<{
      messageId: string;
      createdAt: string;
      authorName: string;
      attachments: Attachment[];
    }>
  > {
    // 길이 상한은 액션 zod 와 동일하게 서비스도 소유(defense-in-depth) — 미래의
    // 다른 호출자(잡 등)가 무제한 본문을 영속·팬아웃하지 못하게 한다.
    const body = input.body.trim();
    const attachmentIds = input.attachmentIds ?? [];
    // 첨부만 있는 메시지는 허용 — 본문·첨부가 모두 비면 거부.
    if (body.length === 0 && attachmentIds.length === 0) {
      return { ok: false, error: 'INVALID_INPUT' };
    }
    if (body.length > 4000) {
      return { ok: false, error: 'INVALID_INPUT' };
    }

    const auth = await this.authorize(input.rfpId, actor);
    if (!auth.ok) return auth;

    const id = randomUUID();
    const createdAt = new Date();
    // 표시 전용 — 알림 제목과 성공 반환에 쓸 작성자 이름. tx 밖에서 1회 조회.
    const author = await this.userRepo.findById(actor.userId);
    const authorName = author?.name ?? '';

    // 메시지 insert + 첨부 재부모(re-parent)를 한 트랜잭션으로 — BidService.addNote
    // 패턴. 첨부는 업로드 시 ownerless draft 로 착지하므로 여기서 본인 소유·미링크
    // 인지 검증한 뒤 rfp_team_message_id 로 옮긴다.
    let linked: Attachment[] = [];
    const pendingEmits: Notification[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txResult = await this._db.transaction(async (tx: any) => {
      if (attachmentIds.length > 0) {
        const rows = await tx
          .select({
            id: attachments.id,
            name: attachments.name,
            size: attachments.size,
            mimeType: attachments.mimeType,
            rfpId: attachments.rfpId,
            bidId: attachments.bidId,
            bidNoteId: attachments.bidNoteId,
            chatMessageId: attachments.chatMessageId,
            rfpTeamMessageId: attachments.rfpTeamMessageId,
            uploadedBy: attachments.uploadedBy,
          })
          .from(attachments)
          .where(inArray(attachments.id, attachmentIds));
        if (rows.length !== attachmentIds.length) return 'INVALID_ATTACHMENT' as const;
        for (const r of rows) {
          if (
            r.uploadedBy !== actor.userId ||
            r.rfpId ||
            r.bidId ||
            r.bidNoteId ||
            r.chatMessageId ||
            r.rfpTeamMessageId
          ) {
            return 'INVALID_ATTACHMENT' as const;
          }
        }
        // 표시 순서는 사용자가 추가한 attachmentIds 순서로 — inArray 는 순서 보장 안 함.
        const byId = new Map<string, (typeof rows)[number]>(rows.map((r: (typeof rows)[number]) => [r.id, r]));
        linked = attachmentIds.map((aid) => {
          const r = byId.get(aid)!;
          return { id: r.id, name: r.name, size: r.size, mimeType: r.mimeType, url: `/api/files/${r.id}` };
        });
      }

      await this.msgRepo.save(
        {
          id,
          rfpId: input.rfpId,
          workspaceId: actor.workspaceId,
          authorUserId: actor.userId,
          body,
          createdAt,
        },
        tx,
      );

      // 팀 알림 팬아웃 — 같은 워크스페이스의 다른 멤버(작성자 제외)에게 인앱 알림.
      // 3분 윈도 내 같은 RFP 알림은 dedupe(ChatService digest 패턴 미러).
      const now = createdAt;
      const windowStart = new Date(chatDigestBucket(now) * CHAT_DIGEST_WINDOW_MS);
      const memberIds = await this.wsRepo.memberUserIds(actor.workspaceId, tx);
      const preview = body.length > 0 ? body.slice(0, 120) : '첨부 파일';
      for (const memberId of memberIds) {
        if (memberId === actor.userId) continue;
        if (await this.notifRepo.hasPendingTeamNotification(memberId, input.rfpId, windowStart, tx)) {
          continue;
        }
        const notif: Notification = {
          id: randomUUID(),
          userId: memberId,
          workspaceId: actor.workspaceId,
          type: 'team_chat.message',
          title: `${authorName}님의 팀 메시지`,
          body: preview,
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/messages?t=${input.rfpId}`,
          createdAt: now.toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
      }

      if (attachmentIds.length > 0) {
        await tx
          .update(attachments)
          .set({ rfpTeamMessageId: id })
          .where(
            and(
              inArray(attachments.id, attachmentIds),
              eq(attachments.uploadedBy, actor.userId),
              isNull(attachments.rfpId),
              isNull(attachments.bidId),
              isNull(attachments.bidNoteId),
              isNull(attachments.chatMessageId),
              isNull(attachments.rfpTeamMessageId),
            ),
          );
      }
      return 'ok' as const;
    });

    if (txResult === 'INVALID_ATTACHMENT') {
      return { ok: false, error: 'INVALID_ATTACHMENT' };
    }

    // commit 이후에만 SSE emit — rollback과 정합(dispatch.ts 계약).
    emitAfterCommit(pendingEmits);
    return {
      ok: true,
      messageId: id,
      createdAt: createdAt.toISOString(),
      authorName,
      attachments: linked,
    };
  }

  async listMessages(
    rfpId: string,
    actor: TeamChatActor,
  ): Promise<ServiceResult<{ messages: RfpTeamMessageWithAuthor[] }>> {
    const auth = await this.authorize(rfpId, actor);
    if (!auth.ok) return auth;
    const messages = await this.msgRepo.listByScope(rfpId, actor.workspaceId);
    return { ok: true, messages };
  }

  async markRead(rfpId: string, actor: TeamChatActor): Promise<ServiceResult<{ readAt: string }>> {
    const auth = await this.authorize(rfpId, actor);
    if (!auth.ok) return auth;
    const at = new Date();
    await this.readRepo.upsert(rfpId, actor.workspaceId, actor.userId, at);
    return { ok: true, readAt: at.toISOString() };
  }

  async listThreads(actor: TeamChatActor): Promise<ServiceResult<{ threads: TeamThreadEntry[] }>> {
    const summaries = await this.msgRepo.listThreadsForWorkspace(actor.workspaceId);
    const entries = await Promise.all(
      summaries.map(async (s) => {
        const [rfp, read] = await Promise.all([
          this.rfpRepo.findById(s.rfpId),
          this.readRepo.getFor(s.rfpId, actor.workspaceId, actor.userId),
        ]);
        const lastReadAt = read?.lastReadAt ?? null;
        const unread =
          s.lastAuthorUserId !== actor.userId &&
          (lastReadAt === null || s.lastMessageAt > lastReadAt);
        return {
          rfpId: s.rfpId,
          rfpCode: rfp?.code ?? '',
          rfpTitle: rfp?.title ?? '',
          preview: s.lastBody.length > 0 ? s.lastBody : '첨부 파일',
          lastMessageAt: s.lastMessageAt.toISOString(),
          unread,
        } satisfies TeamThreadEntry;
      }),
    );
    return { ok: true, threads: entries };
  }
}

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_team_chat_service__: TeamChatService | undefined;
}

export async function getTeamChatService(): Promise<TeamChatService> {
  if (!globalThis.__bidit_team_chat_service__) {
    const [
      { db },
      {
        getInvitationRepo,
        getNotificationRepo,
        getRfpRepo,
        getRfpTeamMessageRepo,
        getRfpTeamMessageReadRepo,
        getUserRepo,
        getWorkspaceRepo,
      },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);
    const [rfpRepo, invRepo, userRepo, msgRepo, readRepo, wsRepo, notifRepo] = await Promise.all([
      getRfpRepo(),
      getInvitationRepo(),
      getUserRepo(),
      getRfpTeamMessageRepo(),
      getRfpTeamMessageReadRepo(),
      getWorkspaceRepo(),
      getNotificationRepo(),
    ]);
    globalThis.__bidit_team_chat_service__ = new TeamChatService(
      db,
      rfpRepo,
      invRepo,
      userRepo,
      msgRepo,
      readRepo,
      wsRepo,
      notifRepo,
    );
  }
  return globalThis.__bidit_team_chat_service__!;
}

export function __resetTeamChatServiceForTest(): void {
  globalThis.__bidit_team_chat_service__ = undefined;
}

export function __setTeamChatServiceForTest(service: TeamChatService): void {
  globalThis.__bidit_team_chat_service__ = service;
}
