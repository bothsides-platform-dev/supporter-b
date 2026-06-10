'use server';

import { z } from 'zod';

import { getTeamChatService } from '@/lib/server/services/team-chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.string().uuid();

export type TeamThreadMessage = {
  id: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
  isSelf: boolean;
};

export type LoadTeamThreadResult = ChatActionResult<{
  rfpId: string;
  workspaceId: string;
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

  return {
    ok: true,
    rfpId: parsed.data,
    workspaceId: ws.workspaceId,
    messages: result.messages.map((m) => ({
      id: m.id,
      authorUserId: m.authorUserId,
      authorName: m.authorName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      isSelf: m.authorUserId === ws.userId,
    })),
  };
}
