'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getOnboardingService } from '@/lib/server/services/onboarding';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ code: z.string().min(1) }).strict();

export type DeleteSamplePgRfpInput = z.infer<typeof Input>;
export type DeleteSamplePgRfpResult = ActionResult;

/** PG 온보딩 샘플 견적 요청 삭제. 세션/입력 파싱 후 OnboardingService 에 위임(초대 PG 게이트). */
export async function deleteSamplePgRfpAction(
  input: DeleteSamplePgRfpInput,
): Promise<DeleteSamplePgRfpResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getOnboardingService();
  return service.deleteSamplePgRfp(parsed.data.code, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
