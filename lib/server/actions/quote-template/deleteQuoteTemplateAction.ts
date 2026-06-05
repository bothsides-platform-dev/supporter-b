'use server';

import { z } from 'zod';

import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';
import { type QuoteActionResult, requireOwnedQuoteTemplate } from './_shared';

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
  const owned = await requireOwnedQuoteTemplate(parsed.data.templateId);
  if (!owned.ok) return owned;

  await (await getBidQuoteTemplateRepo()).remove(parsed.data.templateId);
  return { ok: true };
}
