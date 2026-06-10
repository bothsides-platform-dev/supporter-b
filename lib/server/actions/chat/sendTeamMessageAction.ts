'use server';

import { z } from 'zod';

import { publishTeamChatEvent } from '@/lib/server/realtime/centrifugo';
import { getTeamChatService } from '@/lib/server/services/team-chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z
  .object({
    rfpId: z.string().uuid(),
    body: z.string().min(1).max(4000),
  })
  .strict();

export type SendTeamMessageResult = ChatActionResult<{
  messageId: string;
  createdAt: string;
}>;

/**
 * RFP 팀 채팅(내부 메모) 전송 — (rfpId, 세션 워크스페이스) 스코프에 append.
 * ACL·검증은 TeamChatService 소유. 성공 시 팀 채널로 best-effort 라이브 팬아웃
 * (알림·이메일 없음 — v1 확정 결정).
 */
export async function sendTeamMessageAction(
  input: z.input<typeof Input>,
): Promise<SendTeamMessageResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const service = await getTeamChatService();
  const result = await service.sendMessage(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
    workspaceType: ws.workspaceType,
  });
  if (!result.ok) return result;

  await publishTeamChatEvent(parsed.data.rfpId, ws.workspaceId, {
    type: 'message',
    id: result.messageId,
    body: parsed.data.body.trim(),
    authorUserId: ws.userId,
    authorName: result.authorName,
    createdAt: result.createdAt,
  });

  return { ok: true, messageId: result.messageId, createdAt: result.createdAt };
}
