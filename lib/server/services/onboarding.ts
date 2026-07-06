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

declare global {
  var __bidit_onboarding_service__: OnboardingService | undefined;
}

export async function getOnboardingService(): Promise<OnboardingService> {
  if (!globalThis.__bidit_onboarding_service__) {
    const { db } = await import('@/lib/db/client');
    globalThis.__bidit_onboarding_service__ = new OnboardingService(db);
  }
  return globalThis.__bidit_onboarding_service__!;
}

export function __resetOnboardingServiceForTest(): void {
  globalThis.__bidit_onboarding_service__ = undefined;
}

export function __setOnboardingServiceForTest(service: OnboardingService): void {
  globalThis.__bidit_onboarding_service__ = service;
}
