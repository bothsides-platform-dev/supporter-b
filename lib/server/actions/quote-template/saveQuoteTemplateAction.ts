'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';
import {
  type QuoteActionResult,
  requireOwnedQuoteTemplate,
  requirePgWorkspace,
} from './_shared';

// Mirrors submitBidAction's fee envelope: per-method decimal rates 0..1.
const feeField = z.number().min(0).max(1).optional();

const PaymentFeesSchema = z
  .object({
    card: feeField,
    overseas_card: feeField,
    virtual_account: feeField,
    bank_transfer: feeField,
    naver_pay: feeField,
    kakao_pay: feeField,
    toss_pay: feeField,
    mobile: feeField,
    gift_card: feeField,
  })
  .strict();

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

// 한 PG 워크스페이스가 보유할 수 있는 템플릿 상한 (createRfp 커스텀 결제수단 20개 상한과 동일 결).
const MAX_TEMPLATES = 20;

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
  const { id, name, settleCycle, settleLimit, guaranteeInsurance, paymentFees } =
    parsed.data;
  const repo = await getBidQuoteTemplateRepo();

  if (id) {
    const owned = await requireOwnedQuoteTemplate(id);
    if (!owned.ok) return owned;
    await repo.update(id, {
      name,
      settleCycle,
      settleLimit,
      guaranteeInsurance,
      paymentFees,
    });
    return { ok: true, templateId: id };
  }

  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;
  const existing = await repo.listByWorkspace(ws.workspaceId);
  if (existing.length >= MAX_TEMPLATES) return { ok: false, error: 'LIMIT_REACHED' };

  const templateId = randomUUID();
  await repo.create({
    id: templateId,
    pgWsId: ws.workspaceId,
    name,
    settleCycle,
    settleLimit,
    guaranteeInsurance,
    paymentFees,
    createdBy: ws.userId,
  });
  return { ok: true, templateId };
}
