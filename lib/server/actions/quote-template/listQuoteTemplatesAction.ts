'use server';

import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';
import type { BidQuoteTemplate } from '@/lib/server/repositories/types';
import { type QuoteActionResult, requirePgWorkspace } from './_shared';

export type ListQuoteTemplatesResult = QuoteActionResult<{
  templates: BidQuoteTemplate[];
}>;

/**
 * List the bid quote templates shared across the session's active PG
 * workspace. Cross-workspace isolation: only the session workspace's templates
 * are returned.
 */
export async function listQuoteTemplatesAction(): Promise<ListQuoteTemplatesResult> {
  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;

  const templates = await (await getBidQuoteTemplateRepo()).listByWorkspace(
    ws.workspaceId,
  );
  return { ok: true, templates };
}
