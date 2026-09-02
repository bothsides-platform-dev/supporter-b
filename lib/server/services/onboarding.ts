import { defineAsyncSingleton } from '@/lib/server/_singleton';
import type { ServiceResult } from './types';
import { DrizzleUserRepository } from '@/lib/server/repositories/drizzle/user';
import type { OnboardingKey } from '@/lib/types/onboarding';

export class OnboardingService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: any) {}

  // 온보딩 태스크 완료/닫기 스탬프 — 유저 단위(users.onboarding jsonb). 멱등.
  async mark(
    actor: { userId: string },
    key: OnboardingKey,
    event: 'completed' | 'dismissed',
  ): Promise<ServiceResult> {
    const userRepo = new DrizzleUserRepository(this._db);
    const now = new Date().toISOString();
    await userRepo.markOnboarding(
      actor.userId,
      key,
      event === 'completed' ? { completedAt: now } : { dismissedAt: now },
    );
    return { ok: true };
  }
}

export const {
  get: getOnboardingService,
  set: __setOnboardingServiceForTest,
  reset: __resetOnboardingServiceForTest,
} = defineAsyncSingleton('onboarding_service', 'service', async () => {
  const { getDb } = await import('@/lib/server/repositories/factory');
  return new OnboardingService(await getDb());
});
