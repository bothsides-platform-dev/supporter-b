// 유저 단위 온보딩 상태의 버전드 JSONB 문서.
// lib/types/rfp-terms.ts 와 동일 철학: 읽기는 관대(어떤 _v 든 정규화), 쓰기는 정규(항상 현재
// 버전 emit). 새 온보딩 태스크 추가 = 아래 ONBOARDING_KEYS + 타입 두 곳.

export const USER_ONBOARDING_VERSION = 1 as const;

export type OnboardingTaskState = { completedAt?: string; dismissedAt?: string };

// v1 모양. 모든 키 optional → 키 추가는 non-breaking.
export type UserOnboardingV1 = {
  _v: 1;
  buyerTutorial?: OnboardingTaskState;
  pgTutorial?: OnboardingTaskState;
};

// 현재 정규형(현재는 v1 단일). 미래: UserOnboardingV1 | UserOnboardingV2 …
export type UserOnboarding = UserOnboardingV1;

// 온보딩 태스크 키 어휘 — 타입이 이 단일 배열에서 파생된다(드리프트 방지).
export const ONBOARDING_KEYS = ['buyerTutorial', 'pgTutorial'] as const;
export type OnboardingKey = (typeof ONBOARDING_KEYS)[number];

/**
 * 관대한 읽기 + 정규 쓰기. raw 가 어떤 역대 버전/가비지든 현재 정규형으로 올린다.
 * 알려진 키(ONBOARDING_KEYS)만 보존하고 그 외 필드는 버린다.
 */
export function migrateUserOnboarding(raw: unknown): UserOnboarding {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: UserOnboarding = { _v: USER_ONBOARDING_VERSION };
  for (const key of ONBOARDING_KEYS) {
    const v = o[key];
    if (v && typeof v === 'object') {
      out[key] = v as OnboardingTaskState;
    }
  }
  return out;
}
