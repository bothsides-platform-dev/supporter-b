'use server';

import { z } from 'zod';

import { getChatTemplateRepo } from '@/lib/server/repositories/factory';
import { type ChatActionResult, requireOwnedTemplate } from './_shared';

const Input = z.object({ templateId: z.string().uuid() }).strict();

export type DeleteTemplateInput = z.infer<typeof Input>;
export type DeleteTemplateResult = ChatActionResult;

/**
 * Delete a chat message template owned by the session's active workspace.
 * Cross-workspace guard: FORBIDDEN for another workspace's template,
 * TEMPLATE_NOT_FOUND when it does not exist.
 */
export async function deleteTemplateAction(
  input: DeleteTemplateInput,
): Promise<DeleteTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const owned = await requireOwnedTemplate(parsed.data.templateId);
  if (!owned.ok) return owned;

  await (await getChatTemplateRepo()).remove(parsed.data.templateId);
  return { ok: true };
}
