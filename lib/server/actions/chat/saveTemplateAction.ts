'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { getChatTemplateRepo } from '@/lib/server/repositories/factory';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z
  .object({
    title: z.string().min(1).max(80),
    body: z.string().min(1).max(4000),
  })
  .strict();

export type SaveTemplateInput = z.infer<typeof Input>;
export type SaveTemplateResult = ChatActionResult<{ templateId: string }>;

/**
 * Save a chat message template shared across the session's active workspace.
 * Any workspace member may save; created_by records who authored it.
 */
export async function saveTemplateAction(
  input: SaveTemplateInput,
): Promise<SaveTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const templateId = randomUUID();
  await (await getChatTemplateRepo()).create({
    id: templateId,
    workspaceId: ws.workspaceId,
    title: parsed.data.title,
    body: parsed.data.body,
    createdBy: ws.userId,
  });
  return { ok: true, templateId };
}
