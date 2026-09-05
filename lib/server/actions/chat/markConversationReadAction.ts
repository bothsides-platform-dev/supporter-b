'use server';

import { z } from 'zod';

import { getConversationReadState } from '@/lib/chat/read-state/server';
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

  return (await getConversationReadState()).markRead({
    conversationId: parsed.data.conversationId,
    viewer: { userId: ws.userId, activeWorkspaceId: ws.workspaceId },
  });
}
