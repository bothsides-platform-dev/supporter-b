'use server';

import { z } from 'zod';

import { requirePgSession } from '@/lib/auth/session';
import { getOnboardingService } from '@/lib/server/services/onboarding';

const Input = z.object({ code: z.string().min(1) }).strict();

export type SimulateSampleAwardInput = z.infer<typeof Input>;
export type SimulateSampleAwardResult = { ok: true } | { ok: false; error: string };

/**
 * PG 온보딩 샘플 견적 선정 시뮬레이트. PG 가 견적을 제출한 직후(클라이언트가 잠시 뒤) 호출한다.
 * 세션/입력 파싱 후 OnboardingService 에 위임 — 게이트(isSample·초대 PG·제출 견적)는 서비스가 강제.
 */
export async function simulateSampleAwardAction(
  input: SimulateSampleAwardInput,
): Promise<SimulateSampleAwardResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getOnboardingService();
  return service.simulateSampleAward(parsed.data.code, {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  });
}
