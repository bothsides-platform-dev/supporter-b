'use server';

import type { ActionResult } from '@/lib/server/actions/_result';

export type DuplicateQuoteTemplateInput = { templateId: string };
export type DuplicateQuoteTemplateResult = ActionResult<{ templateId: string }>;

/** 구 클라이언트 호환용. 저장 데이터는 보존하고 조회·변경하지 않는다. */
export async function duplicateQuoteTemplateAction(
  _input: DuplicateQuoteTemplateInput,
): Promise<DuplicateQuoteTemplateResult> {
  return { ok: false, error: 'QUOTE_TEMPLATE_FEATURE_REMOVED' };
}
