'use server';

import type { BidQuoteTemplate } from '@/lib/server/repositories/types';
import { getQuoteTemplateService } from '@/lib/server/services/quote-template';
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

  return (await getQuoteTemplateService()).list({
    userId: ws.userId,
    workspaceId: ws.workspaceId,
  });
}
