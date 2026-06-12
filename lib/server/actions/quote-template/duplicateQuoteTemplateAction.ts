'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';
import {
  type QuoteActionResult,
  requireOwnedQuoteTemplate,
  requirePgWorkspace,
} from './_shared';

const Input = z.object({ templateId: z.uuid() }).strict();

export type DuplicateQuoteTemplateInput = z.infer<typeof Input>;
export type DuplicateQuoteTemplateResult = QuoteActionResult<{ templateId: string }>;

const MAX_TEMPLATES = 20;

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

  const owned = await requireOwnedQuoteTemplate(parsed.data.templateId);
  if (!owned.ok) return owned;

  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;

  const repo = await getBidQuoteTemplateRepo();
  const existing = await repo.listByWorkspace(owned.workspaceId);
  if (existing.length >= MAX_TEMPLATES) return { ok: false, error: 'LIMIT_REACHED' };

  const { template } = owned;
  const newId = randomUUID();
  await repo.create({
    id: newId,
    pgWsId: owned.workspaceId,
    name: `${template.name} 복제`,
    settleCycle: template.settleCycle,
    settleLimit: template.settleLimit,
    guaranteeInsurance: template.guaranteeInsurance,
    paymentFees: { ...template.paymentFees },
    createdBy: ws.userId,
  });

  return { ok: true, templateId: newId };
}
