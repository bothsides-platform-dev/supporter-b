'use server';

import type { ActionResult } from '@/lib/server/actions/_result';
import type { BidQuoteTemplate } from '@/lib/server/repositories/types';

export type ListQuoteTemplatesResult = ActionResult<{ templates: BidQuoteTemplate[] }>;

/** 구 클라이언트 호환용. 보존된 템플릿을 사용자에게 공개하지 않는다. */
export async function listQuoteTemplatesAction(): Promise<ListQuoteTemplatesResult> {
  return { ok: false, error: 'QUOTE_TEMPLATE_FEATURE_REMOVED' };
}
