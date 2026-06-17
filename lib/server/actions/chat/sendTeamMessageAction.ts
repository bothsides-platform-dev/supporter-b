'use server';

import { z } from 'zod';

import { publishTeamChatEvent } from '@/lib/server/realtime/centrifugo';
import { getTeamChatService } from '@/lib/server/services/team-chat';
import type { Attachment } from '@/lib/types/common';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

// body 는 비어도 첨부가 있으면 허용 — 서비스가 "본문·첨부 모두 빔" 만 거부한다.
const Input = z
  .object({
    rfpId: z.string().uuid(),
    body: z.string().max(4000).default(''),
    attachmentIds: z.array(z.string().uuid()).max(20).default([]),
    /** 낙관적 말풍선 상관관계 id — 멀티탭 self-echo 정확 매칭에 사용. max 64자. */
    tempId: z.string().max(64).optional(),
  })
  .strict();

export type SendTeamMessageResult = ChatActionResult<{
  messageId: string;
  createdAt: string;
  attachments: Attachment[];
}>;

/**
 * RFP 팀 채팅(내부 메모) 전송 — (rfpId, 세션 워크스페이스) 스코프에 append.
 * ACL·검증은 TeamChatService 소유. 성공 시 팀 채널로 best-effort 라이브 팬아웃.
 * 인앱/이메일 알림은 TeamChatService.sendMessage 가 소유한다(수신자=워크스페이스
 * 멤버−작성자, 3분 윈도 dedupe + 윈도 종료 시 이메일 다이제스트).
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

  // best-effort — 영속은 이미 완료. publishToChannel 이 자체적으로 throw 하지
  // 않지만, 그 계약이 회귀해도 전송 결과가 실패로 둔갑하지 않게 여기서도 삼킨다
  // (실패 응답을 받은 클라이언트가 재시도하면 메시지가 중복 저장된다).
  await publishTeamChatEvent(parsed.data.rfpId, ws.workspaceId, {
    type: 'message',
    id: result.messageId,
    body: parsed.data.body.trim(),
    authorUserId: ws.userId,
    authorName: result.authorName,
    createdAt: result.createdAt,
    attachments: result.attachments,
    tempId: parsed.data.tempId ?? null,
  }).catch(() => {});

  return {
    ok: true,
    messageId: result.messageId,
    createdAt: result.createdAt,
    attachments: result.attachments,
  };
}
