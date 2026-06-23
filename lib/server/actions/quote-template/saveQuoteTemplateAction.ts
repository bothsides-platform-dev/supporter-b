'use server';

import { z } from 'zod';

import { getQuoteTemplateService } from '@/lib/server/services/quote-template';
import { type QuoteActionResult, requirePgWorkspace } from './_shared';
import { PaymentFeesSchema } from '@/lib/rfp/payment-fees-schema';

const Input = z
  .object({
    // present → update existing; absent → create new
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    // 정산주기 "D+1" / "W+2" / "M+1" 형식
    settleCycle: z.string().regex(/^[DWM]\+[1-9]\d{0,2}$/),
    settleLimit: z.number().nonnegative(),
    guaranteeInsurance: z.number().nonnegative(),
    paymentFees: PaymentFeesSchema,
  })
  .strict();

export type SaveQuoteTemplateInput = z.input<typeof Input>;
export type SaveQuoteTemplateResult = QuoteActionResult<{ templateId: string }>;

/**
 * Save (create or update) a bid quote template shared across the session's
 * active PG workspace. `id` present updates an owned template; absent creates a
 * new one, capped at MAX_TEMPLATES per workspace. Any PG workspace member may
 * save; created_by records who authored it.
 */
export async function saveQuoteTemplateAction(
  input: SaveQuoteTemplateInput,
): Promise<SaveQuoteTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;

  return (await getQuoteTemplateService()).save(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
  });
}
