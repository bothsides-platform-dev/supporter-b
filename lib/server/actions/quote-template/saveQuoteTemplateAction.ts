'use server';

import type { ActionResult } from '@/lib/server/actions/_result';
import type { PaymentMethod, TierRates } from '@/lib/types/bid';

export type SaveQuoteTemplateInput = {
  id?: string;
  name: string;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  signupFee?: number;
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
};
export type SaveQuoteTemplateResult = ActionResult<{ templateId: string }>;

/** 구 클라이언트 호환용. 저장 데이터는 보존하고 조회·변경하지 않는다. */
export async function saveQuoteTemplateAction(
  _input: SaveQuoteTemplateInput,
): Promise<SaveQuoteTemplateResult> {
  return { ok: false, error: 'QUOTE_TEMPLATE_FEATURE_REMOVED' };
}
