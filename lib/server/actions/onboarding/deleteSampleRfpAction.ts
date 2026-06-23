'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getOnboardingService } from '@/lib/server/services/onboarding';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ code: z.string().min(1) }).strict();

export type DeleteSampleRfpInput = z.infer<typeof Input>;
export type DeleteSampleRfpResult = ActionResult;

/** 온보딩 샘플 견적 요청 삭제. 세션/입력 파싱 후 OnboardingService 에 위임. */
export async function deleteSampleRfpAction(
  input: DeleteSampleRfpInput,
): Promise<DeleteSampleRfpResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getOnboardingService();
  return service.deleteSampleRfp(parsed.data.code, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
