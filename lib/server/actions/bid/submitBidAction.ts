'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getBidService } from '@/lib/server/services/bid';
import type { ActionResult } from '@/lib/server/actions/_result';
import { PaymentFeesSchema } from '@/lib/rfp/payment-fees-schema';
import { SETTLE_CYCLE_RE } from '@/lib/utils/settle-cycle';

const Input = z
  .object({
    rfpId: z.string().min(1),
    // 정산주기 정본 형식("D+1"/"W+2"/"M+1"). UI 우회 호출이 자유 텍스트를
    // 봉인입찰에 기록하지 못하도록 신뢰 경계에서 강제 (saveQuoteTemplateAction 과 대칭).
    settleCycle: z.string().regex(SETTLE_CYCLE_RE),
    // 0 은 '한도 없음'이 아니라 '한도 0원'으로 읽혀 구매사 비교를 오독시킨다.
    // 클라이언트 게이트(isSettleLimitValid)와 같은 판정을 신뢰 경계에서도 강제한다.
    settleLimit: z.number().positive(),
    guaranteeInsurance: z.number().nonnegative(),
    signupFee: z.number().nonnegative().default(0),
    paymentFees: PaymentFeesSchema,
    customFees: z.record(z.string(), z.number().min(0).max(1)).optional().default({}),
    proposalAttachmentId: z.string().uuid().optional(),
    memo: z.string().max(2000).optional(),
    // 선정되면 쓸 계약서(PG 소유 템플릿). 선택 사항 — 소유 검증은 서비스가 한다.
    signingTemplateId: z.string().uuid().optional(),
  })
  .strict();

export type SubmitBidInput = z.input<typeof Input>;
export type SubmitBidResult = ActionResult<{ bidId: string }>;

export async function submitBidAction(input: SubmitBidInput): Promise<SubmitBidResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getBidService();
  const result = await service.submit(
    {
      rfpId: parsed.data.rfpId,
      settleCycle: parsed.data.settleCycle,
      settleLimit: parsed.data.settleLimit,
      guaranteeInsurance: parsed.data.guaranteeInsurance,
      signupFee: parsed.data.signupFee,
      paymentFees: parsed.data.paymentFees,
      customFees: parsed.data.customFees,
      proposalAttachmentId: parsed.data.proposalAttachmentId,
      memo: parsed.data.memo,
      signingTemplateId: parsed.data.signingTemplateId,
    },
    { userId: actor.userId, workspaceId: actor.workspaceId },
  );

  if (result.ok) {
    revalidatePath(`/inbox/${result.rfpCode}`);
  }
  return result.ok ? { ok: true, bidId: result.bidId } : result;
}
