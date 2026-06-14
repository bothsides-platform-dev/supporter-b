import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { attachments } from '@/lib/db/schema';
import type { Attachment } from '@/lib/types/common';
import type {
  InvitationRepo,
  RfpRepo,
  RfpTeamMessageRepo,
  RfpTeamMessageWithAuthor,
  UserRepo,
} from '@/lib/server/repositories/types';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { ServiceResult } from './types';

export type TeamChatActor = {
  userId: string;
  workspaceId: string;
  workspaceType: WorkspaceType;
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

    // 메시지 insert + 첨부 재부모(re-parent)를 한 트랜잭션으로 — BidService.addNote
    // 패턴. 첨부는 업로드 시 ownerless draft 로 착지하므로 여기서 본인 소유·미링크
    // 인지 검증한 뒤 rfp_team_message_id 로 옮긴다.
    let linked: Attachment[] = [];
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

    const author = await this.userRepo.findById(actor.userId);
    return {
      ok: true,
      messageId: id,
      createdAt: createdAt.toISOString(),
      authorName: author?.name ?? '',
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
}

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_team_chat_service__: TeamChatService | undefined;
}

export async function getTeamChatService(): Promise<TeamChatService> {
  if (!globalThis.__bidit_team_chat_service__) {
    const [
      { db },
      { getInvitationRepo, getRfpRepo, getRfpTeamMessageRepo, getUserRepo },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);
    const [rfpRepo, invRepo, userRepo, msgRepo] = await Promise.all([
      getRfpRepo(),
      getInvitationRepo(),
      getUserRepo(),
      getRfpTeamMessageRepo(),
    ]);
    globalThis.__bidit_team_chat_service__ = new TeamChatService(
      db,
      rfpRepo,
      invRepo,
      userRepo,
      msgRepo,
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
