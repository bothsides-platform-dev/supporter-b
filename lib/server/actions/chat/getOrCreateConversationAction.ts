'use server';

import { z } from 'zod';

import { getChatService } from '@/lib/server/services/chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.string().uuid();

export type GetOrCreateConversationResult = ChatActionResult<{ conversationId: string }>;

/**
 * 선정 결과 화면의 "메시지 시작" CTA용 — 상대 워크스페이스와의 대화를 보장하고
 * conversationId를 돌려준다. 메시지는 보내지 않는다. 빈 대화는 인박스 목록·
 * `/messages?c=<id>` 딥링크에서 그대로 열린다(작성란 노출).
 */
export async function getOrCreateConversationAction(
  counterpartyWorkspaceId: string,
): Promise<GetOrCreateConversationResult> {
  const parsed = Input.safeParse(counterpartyWorkspaceId);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const service = await getChatService();
  return service.getOrCreateConversation(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
    workspaceType: ws.workspaceType,
  });
}
