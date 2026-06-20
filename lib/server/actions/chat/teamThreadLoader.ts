'use server';

import { z } from 'zod';

import { getTeamChatService } from '@/lib/server/services/team-chat';
import { getUserRepo } from '@/lib/server/repositories/factory';
import type { Attachment } from '@/lib/types/common';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.string().uuid();

export type TeamThreadMessage = {
  id: string;
  authorUserId: string;
  authorName: string;
  authorAvatarUpdatedAt: string | null;
  body: string;
  createdAt: string;
  isSelf: boolean;
  attachments: Attachment[];
};

export type LoadTeamThreadResult = ChatActionResult<{
  rfpId: string;
  workspaceId: string;
  /** 세션 유저 id — 라이브 echo 의 self 판별용(클라이언트는 세션을 모른다). */
  viewerUserId: string;
  /** 뷰어 아바타 버전 — 낙관적 말풍선 아바타 표시용. */
  viewerAvatarUpdatedAt: string | null;
  /** 멘션 자동완성/렌더용 팀 로스터. */
  teamMembers: { userId: string; name: string; joinedAt: string; avatarUpdatedAt: string | null }[];
  messages: TeamThreadMessage[];
}>;

/**
 * (rfp, 세션 워크스페이스) 팀 스레드 로드 — 채팅 레일 '팀 채팅' 탭용.
 * workspaceId를 함께 반환: 클라이언트가 Centrifugo 채널명
 * (`team:rfp:<rfpId>:<wsId>`)을 조립하는 데 필요하다 (세션은 서버 전용).
 */
export async function loadTeamThread(
  rfpId: string,
): Promise<LoadTeamThreadResult> {
  const parsed = Input.safeParse(rfpId);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const service = await getTeamChatService();
  const result = await service.listMessages(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
    workspaceType: ws.workspaceType,
  });
  if (!result.ok) return result;

  const membersResult = await service.listTeamMembers(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
    workspaceType: ws.workspaceType,
  });
  const teamMembers = membersResult.ok ? membersResult.members : [];

  const viewer = await (await getUserRepo()).findById(ws.userId);

  return {
    ok: true,
    rfpId: parsed.data,
    workspaceId: ws.workspaceId,
    viewerUserId: ws.userId,
    viewerAvatarUpdatedAt: viewer?.avatarUpdatedAt ?? null,
    teamMembers,
    messages: result.messages.map((m) => ({
      id: m.id,
      authorUserId: m.authorUserId,
      authorName: m.authorName,
      authorAvatarUpdatedAt: m.authorAvatarUpdatedAt
        ? new Date(m.authorAvatarUpdatedAt).toISOString()
        : null,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      isSelf: m.authorUserId === ws.userId,
      attachments: m.attachments,
    })),
  };
}
