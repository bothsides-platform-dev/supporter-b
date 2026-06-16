'use server';

import { z } from 'zod';

import { getQuoteTemplateService } from '@/lib/server/services/quote-template';
import { type QuoteActionResult, requirePgWorkspace } from './_shared';

const Input = z.object({ templateId: z.uuid() }).strict();

export type DuplicateQuoteTemplateInput = z.infer<typeof Input>;
export type DuplicateQuoteTemplateResult = QuoteActionResult<{ templateId: string }>;

/**
 * Duplicate a bid quote template owned by the session's active PG workspace.
 * The new template is named "<원본이름> 복제". Cross-workspace guard: FORBIDDEN
 * for another workspace's template. LIMIT_REACHED when the workspace already
 * has 20 templates.
 */
export async function duplicateQuoteTemplateAction(
  input: DuplicateQuoteTemplateInput,
): Promise<DuplicateQuoteTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;

  return (await getQuoteTemplateService()).duplicate(parsed.data.templateId, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
  });
}
