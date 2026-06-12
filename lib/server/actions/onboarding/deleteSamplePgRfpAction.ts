'use server';

import { z } from 'zod';

import { requirePgSession } from '@/lib/auth/session';
import { getOnboardingService } from '@/lib/server/services/onboarding';

const Input = z.object({ code: z.string().min(1) }).strict();

export type DeleteSamplePgRfpInput = z.infer<typeof Input>;
export type DeleteSamplePgRfpResult = { ok: true } | { ok: false; error: string };

/** PG 온보딩 샘플 견적 요청 삭제. 세션/입력 파싱 후 OnboardingService 에 위임(초대 PG 게이트). */
export async function deleteSamplePgRfpAction(
  input: DeleteSamplePgRfpInput,
): Promise<DeleteSamplePgRfpResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getOnboardingService();
  return service.deleteSamplePgRfp(parsed.data.code, {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  });
}
