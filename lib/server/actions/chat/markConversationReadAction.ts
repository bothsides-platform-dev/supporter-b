'use server';

import { z } from 'zod';

import { publishChatEvent } from '@/lib/server/realtime/centrifugo';
import { getChatService } from '@/lib/server/services/chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.object({ conversationId: z.string().uuid() }).strict();

export type MarkConversationReadInput = z.infer<typeof Input>;
export type MarkConversationReadResult = ChatActionResult<{ readAt: string }>;

export async function markConversationReadAction(
  input: MarkConversationReadInput,
): Promise<MarkConversationReadResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const actor = { userId: ws.userId, workspaceId: ws.workspaceId, workspaceType: ws.workspaceType };

  const service = await getChatService();
  const result = await service.markConversationRead(parsed.data.conversationId, actor);

  if (result.ok) {
    // Best-effort conversation-wide fanout. The client accepts this receipt
    // only when workspaceId identifies its counterparty workspace.
    await publishChatEvent(parsed.data.conversationId, {
      type: 'read',
      userId: ws.userId,
      workspaceId: ws.workspaceId,
      readAt: result.readAt,
    });
  }

  return result;
}
