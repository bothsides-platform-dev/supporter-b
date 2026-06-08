'use server';

import { z } from 'zod';

import { getAttachmentRepo } from '@/lib/server/repositories/factory';
import { publishChatEvent } from '@/lib/server/realtime/centrifugo';
import { getChatService } from '@/lib/server/services/chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z
  .object({
    conversationId: z.string().uuid().optional(),
    counterpartyWorkspaceId: z.string().uuid().optional(),
    counterpartyEmail: z.string().email().optional(),
    body: z.string().max(4000).optional().default(''),
    rfpId: z.string().uuid().optional(),
    attachmentIds: z.array(z.string().uuid()).max(5).optional().default([]),
  })
  .strict();

export type SendChatMessageInput = z.input<typeof Input>;
export type SendChatMessageResult = ChatActionResult<{
  conversationId: string;
  messageId: string;
}>;

/**
 * Send a chat message — buyer & PG both call this; the sending side is derived
 * from `session.user.workspaceType`. Resolves the conversation by id (membership
 * checked), by counterparty workspace id, or by counterparty email (cold contact
 * — no accept gate). buyer↔PG only: a same-type counterparty is rejected,
 * preserving the complete-privacy invariant.
 */
export async function sendChatMessageAction(
  input: SendChatMessageInput,
): Promise<SendChatMessageResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const data = parsed.data;

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const actor = { userId: ws.userId, workspaceId: ws.workspaceId, workspaceType: ws.workspaceType };

  const service = await getChatService();
  const result = await service.sendMessage(
    {
      conversationId: data.conversationId,
      counterpartyWorkspaceId: data.counterpartyWorkspaceId,
      counterpartyEmail: data.counterpartyEmail,
      body: data.body,
      rfpId: data.rfpId,
      attachmentIds: data.attachmentIds,
    },
    actor,
  );

  if (result.ok) {
    // Best-effort live fanout — never blocks the send. Load saved attachments so
    // the receiver can render tiles without a refetch.
    const savedAtts = data.attachmentIds.length > 0
      ? await (await getAttachmentRepo()).findByChatMessageIds([result.messageId])
      : [];
    await publishChatEvent(result.conversationId, {
      type: 'message',
      id: result.messageId,
      body: data.body.trim(),
      authorWsId: ws.workspaceId,
      rfpId: data.rfpId ?? null,
      createdAt: new Date().toISOString(),
      attachments: savedAtts.map(({ chatMessageId: _cid, ...att }) => att),
    });
  }
  return result;
}
