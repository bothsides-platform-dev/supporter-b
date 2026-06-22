'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getRfpService } from '@/lib/server/services/rfp';
import { logBusinessEvent } from '@/lib/observability/log';
import { isValidWebsiteUrl, normalizeWebsiteUrl, WEBSITE_URL_ERROR } from '@/lib/validation/website-url';
import { MERCHANT_TIERS } from '@/lib/types/bid';
import type { RfpActionResult } from './_shared';

const PAYMENT_METHODS = [
  'card',
  'overseas_card',
  'virtual_account',
  'bank_transfer',
  'naver_pay',
  'kakao_pay',
  'toss_pay',
  'mobile',
  'gift_card',
] as const;

const Input = z
  .object({
    title: z.string().min(1).max(200),
    memo: z.string().max(2000).optional(),
    deadline: z.string().datetime({ offset: true }),
    allowedPgWorkspaceIds: z.array(z.string().uuid()).max(50),
    rfpAttachmentIds: z.array(z.string().uuid()).optional(),
    requiredPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).optional().default([]),
    customPaymentMethods: z
      .array(z.object({ label: z.string().min(1).max(50) }))
      .max(20)
      .optional()
      .default([]),
    send: z.boolean().optional().default(false),
    bizProfileMode: z
      .enum(['inherit', 'override', 'none'])
      .optional()
      .default('inherit'),
    bizNoOverride: z.string().min(1).max(50).optional(),
    gradeOverride: z.enum(MERCHANT_TIERS).optional(),
    websiteUrl: z
      .string()
      .max(500)
      .optional()
      .refine((v) => v === undefined || isValidWebsiteUrl(v), {
        message: WEBSITE_URL_ERROR,
      }),
    mainProducts: z.string().max(200).optional(),
    annualPgVolume: z.string().max(100).optional(),
    currentFeeRate: z.string().max(50).optional(),
    currentSettlementLimit: z.string().max(100).optional(),
    currentGuaranteeInsurance: z.string().max(100).optional(),
    currentSettlementCycle: z.string().max(50).optional(),
    deliveryServicePeriod: z.string().max(100).optional(),
    boardVisible: z.boolean().optional().default(true),
    currentFeeVisibleToPg: z.boolean().optional().default(true),
    currentSolution: z.enum(['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other']).optional(),
    currentSolutionDetail: z.string().max(100).optional(),
    contractType: z.enum(['new', 'renewal']).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.send && d.requiredPaymentMethods.length + d.customPaymentMethods.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiredPaymentMethods'],
        message: '발송하려면 결제수단을 1개 이상 선택해야 합니다.',
      });
    }
    // 홈페이지: 발송 시 필수 + 형식 검증 (드래프트 저장은 비어도 허용)
    if (d.send) {
      const v = (d.websiteUrl ?? '').trim();
      if (v === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['websiteUrl'],
          message: '발송하려면 홈페이지 주소를 입력해야 합니다.',
        });
      } else if (!isValidWebsiteUrl(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['websiteUrl'],
          message: WEBSITE_URL_ERROR,
        });
      }
    }
  });

export type CreateRfpInput = z.input<typeof Input>;
export type CreateRfpResult = RfpActionResult<{ rfpId: string }>;

export async function createRfpAction(
  input: CreateRfpInput,
): Promise<CreateRfpResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  const result = await service.createRfp(
    {
      title: parsed.data.title,
      memo: parsed.data.memo,
      deadline: new Date(parsed.data.deadline),
      allowedPgWorkspaceIds: parsed.data.allowedPgWorkspaceIds,
      rfpAttachmentIds: parsed.data.rfpAttachmentIds,
      requiredPaymentMethods: parsed.data.requiredPaymentMethods,
      customPaymentMethods: parsed.data.customPaymentMethods,
      send: parsed.data.send,
      boardVisible: parsed.data.boardVisible,
      currentFeeVisibleToPg: parsed.data.currentFeeVisibleToPg,
      contractType: parsed.data.contractType,
      bizProfileMode: parsed.data.bizProfileMode,
      bizNoOverride: parsed.data.bizNoOverride,
      gradeOverride: parsed.data.gradeOverride,
      websiteUrl: parsed.data.websiteUrl
        ? normalizeWebsiteUrl(parsed.data.websiteUrl.trim()) || undefined
        : undefined,
      mainProducts: parsed.data.mainProducts,
      annualPgVolume: parsed.data.annualPgVolume,
      currentFeeRate: parsed.data.currentFeeRate,
      currentSettlementLimit: parsed.data.currentSettlementLimit,
      currentGuaranteeInsurance: parsed.data.currentGuaranteeInsurance,
      currentSettlementCycle: parsed.data.currentSettlementCycle,
      deliveryServicePeriod: parsed.data.deliveryServicePeriod,
      currentSolution: parsed.data.currentSolution,
      currentSolutionDetail: parsed.data.currentSolutionDetail,
    },
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );

  if (result.ok && parsed.data.send) {
    logBusinessEvent('rfp.sent', {
      rfpId: result.rfpId,
      inviteCount: parsed.data.allowedPgWorkspaceIds.length,
    });
  }

  return result;
}
