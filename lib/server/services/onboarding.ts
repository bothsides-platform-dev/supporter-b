import type { Actor, ServiceResult } from './types';
import { seedSampleRfpInTx, deleteSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';

export class OnboardingService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: any) {}

  async seedSampleRfp(input: { buyerWsId: string; buyerUserId: string }): Promise<{ seeded: boolean; rfpId?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction((tx: any) => seedSampleRfpInTx(tx, input));
  }

  // 소유권은 actor.workspaceId 로만 게이트한다(userId 는 Actor 계약상 받지만 여기선 미사용).
  async deleteSampleRfp(code: string, actor: Actor): Promise<ServiceResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction((tx: any) => deleteSampleRfpInTx(tx, { code, workspaceId: actor.workspaceId }));
  }
}

declare global {
  // eslint-disable-next-line no-var
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
