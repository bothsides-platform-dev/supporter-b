'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import { logBusinessEvent } from '@/lib/observability/log';
import { isValidWebsiteUrlLight, normalizeWebsiteUrl } from '@/lib/validation/website-url';
import type { RfpActionResult } from './_shared';
import { SHOW_TEST_PG_COOKIE, showTestPgFromCookie } from '@/lib/features/test-pg';

import { createRfpInputSchema as Input } from '@/lib/rfp/create-input';

export type CreateRfpInput = z.input<typeof Input>;
export type CreateRfpResult = RfpActionResult<{ rfpId: string }>;

export async function createRfpAction(
  input: CreateRfpInput,
  expectedActor?: { userId: string; workspaceId: string },
): Promise<CreateRfpResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  if (expectedActor && (actor.userId !== expectedActor.userId || actor.workspaceId !== expectedActor.workspaceId)) return { ok: false, error: 'WORKSPACE_CHANGED' };

  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    // 경량 검증은 통과하지만 서버 정밀 검증(TLD 체크)에서만 거부된 websiteUrl → INVALID_WEBSITE
    // 이 경우는 클라이언트가 잡지 못한 "존재하지 않는 TLD" 오류이므로 Step 2 필드 에러로 표면화한다.
    // 그 외 모든 입력 오류(빈 값 필수 위반, 결제수단 누락 등)는 INVALID_INPUT.
    const rawWebsite = (input.websiteUrl ?? '').trim();
    const websiteServerRejected =
      rawWebsite !== '' &&
      isValidWebsiteUrlLight(rawWebsite) &&
      parsed.error.issues.some((i) => i.path[0] === 'websiteUrl');
    return { ok: false, error: websiteServerRejected ? 'INVALID_WEBSITE' : 'INVALID_INPUT' };
  }

  const service = await getRfpService();
  const includeTestPg = parsed.data.send && showTestPgFromCookie((await cookies()).get(SHOW_TEST_PG_COOKIE)?.value);
  const result = await service.createRfp(
    {
      guestDraft: parsed.data.guestDraft,
      journeyDraftId: parsed.data.journeyDraftId,
      industryGroupId: parsed.data.industryGroupId,
      customIndustryName: parsed.data.customIndustryName,
      requestKey: parsed.data.requestKey,
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
      currentPgs: parsed.data.currentPgs,
      bizProfileMode: parsed.data.bizProfileMode,
      bizNoOverride: parsed.data.bizNoOverride,
      gradeOverride: parsed.data.gradeOverride,
      websiteUrl: parsed.data.websiteUrl
        ? normalizeWebsiteUrl(parsed.data.websiteUrl.trim()) || undefined
        : undefined,
      mainProducts: parsed.data.mainProducts,
      productInfo: parsed.data.productInfo,
      annualPgVolume: parsed.data.annualPgVolume,
      currentFeeRate: parsed.data.currentFeeRate,
      currentSettlementLimit: parsed.data.currentSettlementLimit,
      currentGuaranteeInsurance: parsed.data.currentGuaranteeInsurance,
      currentSettlementCycle: parsed.data.currentSettlementCycle,
      deliveryServicePeriod: parsed.data.deliveryServicePeriod,
      currentSolution: parsed.data.currentSolution,
      currentSolutionDetail: parsed.data.currentSolutionDetail,
    },
    { userId: actor.userId, workspaceId: actor.workspaceId },
    includeTestPg,
  );

  if (result.ok && parsed.data.send) {
    logBusinessEvent('rfp.sent', {
      rfpId: result.rfpId,
      inviteCount: parsed.data.allowedPgWorkspaceIds.length,
    });
  }

  return result;
}
