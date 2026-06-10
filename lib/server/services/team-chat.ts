import { randomUUID } from 'node:crypto';

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

// RFP-scoped internal team thread (v1: no mentions/notifications/read-state/
// attachments — 확정 결정). Deliberately NOT part of ChatService: that service
// owns buyer↔PG pair resolution, attachment linking and notification fanout,
// none of which apply here. ACL mirrors the page loaders: buyer must own the
// RFP, PG must hold an invitation (invRepo.canAccess — same gate as
// loadPgRfpDetail). Single insert, no transaction or fanout needed.
export class TeamChatService {
  constructor(
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
    input: { rfpId: string; body: string },
    actor: TeamChatActor,
  ): Promise<
    ServiceResult<{ messageId: string; createdAt: string; authorName: string }>
  > {
    const body = input.body.trim();
    if (body.length === 0) return { ok: false, error: 'INVALID_INPUT' };

    const auth = await this.authorize(input.rfpId, actor);
    if (!auth.ok) return auth;

    const id = randomUUID();
    const createdAt = new Date();
    await this.msgRepo.save({
      id,
      rfpId: input.rfpId,
      workspaceId: actor.workspaceId,
      authorUserId: actor.userId,
      body,
      createdAt,
    });

    const author = await this.userRepo.findById(actor.userId);
    return {
      ok: true,
      messageId: id,
      createdAt: createdAt.toISOString(),
      authorName: author?.name ?? '',
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
    const {
      getInvitationRepo,
      getRfpRepo,
      getRfpTeamMessageRepo,
      getUserRepo,
    } = await import('@/lib/server/repositories/factory');
    const [rfpRepo, invRepo, userRepo, msgRepo] = await Promise.all([
      getRfpRepo(),
      getInvitationRepo(),
      getUserRepo(),
      getRfpTeamMessageRepo(),
    ]);
    globalThis.__bidit_team_chat_service__ = new TeamChatService(
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
