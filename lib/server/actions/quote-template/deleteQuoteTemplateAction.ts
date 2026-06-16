'use server';

import { z } from 'zod';

import { getQuoteTemplateService } from '@/lib/server/services/quote-template';
import { type QuoteActionResult, requirePgWorkspace } from './_shared';

const Input = z.object({ templateId: z.string().uuid() }).strict();

export type DeleteQuoteTemplateInput = z.infer<typeof Input>;
export type DeleteQuoteTemplateResult = QuoteActionResult;

/**
 * Delete a bid quote template owned by the session's active PG workspace.
 * Cross-workspace guard: FORBIDDEN for another workspace's template,
 * TEMPLATE_NOT_FOUND when it does not exist.
 */
export async function deleteQuoteTemplateAction(
  input: DeleteQuoteTemplateInput,
): Promise<DeleteQuoteTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;

  return (await getQuoteTemplateService()).remove(parsed.data.templateId, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
  });
}
