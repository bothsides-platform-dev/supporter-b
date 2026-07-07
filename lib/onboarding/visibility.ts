// 홈 화면(BuyerHome/PgHome)의 '샘플로 둘러보기' 엔트리 카드 노출 여부 — 순수 파생. 서버 로더가
// getUserRepo().getOnboarding(userId) 로 읽은 값을 그대로 넘긴다.
import { isOnboardingTaskDone, type OnboardingKey, type UserOnboarding } from '@/lib/types/onboarding';

export function shouldShowSampleEntry(onboarding: UserOnboarding, key: OnboardingKey): boolean {
  return !isOnboardingTaskDone(onboarding[key]);
}
