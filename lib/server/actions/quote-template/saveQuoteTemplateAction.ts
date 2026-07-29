'use server';

import { z } from 'zod';

import { getQuoteTemplateService } from '@/lib/server/services/quote-template';
import { type QuoteActionResult, requirePgWorkspace } from './_shared';
import { PaymentFeesSchema } from '@/lib/rfp/payment-fees-schema';
import { SETTLE_CYCLE_RE } from '@/lib/utils/settle-cycle';

const Input = z
  .object({
    // present → update existing; absent → create new
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    // 정산주기 정본 형식("D+1"/"W+2"/"M+1") — submitBidAction 과 동일한 단일 출처.
    settleCycle: z.string().regex(SETTLE_CYCLE_RE),
    // submitBidAction 과 동일 판정 — 0 은 '한도 없음'이 아니라 '한도 0원'으로 읽힌다.
    settleLimit: z.number().positive(),
    guaranteeInsurance: z.number().nonnegative(),
    signupFee: z.number().nonnegative().default(0),
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
