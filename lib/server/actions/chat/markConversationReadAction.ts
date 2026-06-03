'use server';

import { z } from 'zod';

import {
  getChatConversationRepo,
  getChatReadRepo,
} from '@/lib/server/repositories/factory';
import { publishChatEvent } from '@/lib/server/realtime/centrifugo';
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

  const conv = await (await getChatConversationRepo()).findById(
    parsed.data.conversationId,
  );
  if (!conv) return { ok: false, error: 'CONVERSATION_NOT_FOUND' };
  const myWsId = ws.workspaceType === 'buyer' ? conv.buyerWsId : conv.pgWsId;
  if (myWsId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };

  const now = new Date();
  await (await getChatReadRepo()).upsert(conv.id, ws.userId, now);

  // Best-effort live read receipt to the counterparty.
  // readAt travels in the payload so the receiver uses server time, not client clock.
  await publishChatEvent(conv.id, {
    type: 'read',
    userId: ws.userId,
    readAt: now.toISOString(),
  });

  return { ok: true, readAt: now.toISOString() };
}
