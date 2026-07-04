import type { Actor, ServiceResult } from './types';
import { seedSampleRfpInTx, deleteSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';
import {
  seedSamplePgRfpInTx,
  simulateSampleAwardInTx,
  deleteSamplePgRfpInTx,
} from '@/lib/server/onboarding/sample-pg-rfp';
import { DrizzleUserRepository } from '@/lib/server/repositories/drizzle/user';
import type { OnboardingKey } from '@/lib/types/onboarding';

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

  // ── PG 온보딩 샘플 ──────────────────────────────────────────────────────────
  async seedSamplePgRfp(input: { pgWsId: string; pgUserId: string }): Promise<{ seeded: boolean; rfpId?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction((tx: any) => seedSamplePgRfpInTx(tx, input));
  }

  // PG 가 견적을 제출한 뒤 호출 — 샘플 선정을 시뮬레이트한다. 게이트는 tx 함수가 강제.
  async simulateSampleAward(code: string, actor: Actor): Promise<ServiceResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction((tx: any) => simulateSampleAwardInTx(tx, { code, pgWsId: actor.workspaceId }));
  }

  // 소유권은 초대 PG(actor.workspaceId) 로 게이트 — buyerWsId 가 아닌 allowlist 기준(tx 함수가 강제).
  async deleteSamplePgRfp(code: string, actor: Actor): Promise<ServiceResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction((tx: any) => deleteSamplePgRfpInTx(tx, { code, pgWsId: actor.workspaceId }));
  }

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
