'use server';

import { z } from 'zod';

import { getChatService } from '@/lib/server/services/chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.string().uuid();

export type LookupConversationResult = ChatActionResult<{
  conversationId: string | null;
}>;

/**
 * 읽기 전용 wsId→conversationId 해소 — 채팅 레일 표시용.
 * 없으면 null 을 돌려주고 **대화를 생성하지 않는다** (sealed-bid: 열람·포커스
 * 추종만으로 빈 대화가 상대 인박스에 뜨면 관심 신호가 샌다). 생성은 첫 메시지
 * 전송(sendChatMessageAction의 counterpartyWorkspaceId 경로)에만 맡긴다.
 */
export async function lookupConversationAction(
  counterpartyWorkspaceId: string,
): Promise<LookupConversationResult> {
  const parsed = Input.safeParse(counterpartyWorkspaceId);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const service = await getChatService();
  return service.findConversation(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
    workspaceType: ws.workspaceType,
  });
}
