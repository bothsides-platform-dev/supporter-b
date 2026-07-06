'use server';

import { z } from 'zod';

import { requireBuyerActor, requirePgActor } from '@/lib/server/actions/_session';
import { getOnboardingService } from '@/lib/server/services/onboarding';
import { ONBOARDING_KEYS } from '@/lib/types/onboarding';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    key: z.enum(ONBOARDING_KEYS),
    event: z.enum(['completed', 'dismissed']),
  })
  .strict();

export type UpdateOnboardingInput = z.infer<typeof Input>;
export type UpdateOnboardingResult = ActionResult;

/**
 * 유저 단위 온보딩 태스크 완료/닫기 스탬프. key 에 따라 세션 게이트가 갈린다 —
 * buyerSample 은 buyer 세션, pgSample 은 PG 세션. 스탬프 자체(멱등)는 서비스가 담당.
 */
export async function updateOnboardingAction(
  input: UpdateOnboardingInput,
): Promise<UpdateOnboardingResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const actor =
    parsed.data.key === 'buyerSample' ? await requireBuyerActor() : await requirePgActor();
  if (!actor.ok) return actor;

  const service = await getOnboardingService();
  return service.mark({ userId: actor.userId }, parsed.data.key, parsed.data.event);
}
