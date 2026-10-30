'use server';

import type { ActionResult } from '@/lib/server/actions/_result';

export type DeleteQuoteTemplateInput = { templateId: string };
export type DeleteQuoteTemplateResult = ActionResult;

/** 구 클라이언트 호환용. 저장 데이터는 보존하고 조회·변경하지 않는다. */
export async function deleteQuoteTemplateAction(
  _input: DeleteQuoteTemplateInput,
): Promise<DeleteQuoteTemplateResult> {
  return { ok: false, error: 'QUOTE_TEMPLATE_FEATURE_REMOVED' };
}
