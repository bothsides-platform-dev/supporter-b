'use server';
import { z } from 'zod';
import { getTeamChatService } from '@/lib/server/services/team-chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.object({ rfpId: z.string().uuid() }).strict();
export type MarkTeamThreadReadResult = ChatActionResult<{ readAt: string }>;

export async function markTeamThreadReadAction(
  input: z.infer<typeof Input>,
): Promise<MarkTeamThreadReadResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  const service = await getTeamChatService();
  return service.markRead(parsed.data.rfpId, {
    userId: ws.userId, workspaceId: ws.workspaceId, workspaceType: ws.workspaceType,
  });
}
