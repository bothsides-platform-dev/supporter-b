// 홈 화면(BuyerHome/PgHome)의 튜토리얼 진입 UI 노출 여부 — 순수 파생. 서버 로더가
// getUserRepo().getOnboarding(userId) 로 읽은 값을 그대로 넘긴다.
import type { OnboardingKey, UserOnboarding } from '@/lib/types/onboarding';

/** 완료·닫기 어느 쪽도 찍히지 않은 첫 진입 — 환영 모달을 자동으로 띄운다. */
export function shouldShowWelcome(onboarding: UserOnboarding, key: OnboardingKey): boolean {
  const s = onboarding[key];
  return !(s?.completedAt || s?.dismissedAt);
}

/** '나중에 하기'로 닫았을 뿐 아직 완료하지 않은 유저 — 홈에 재유도 배너를 보여준다. */
export function shouldShowResumeNudge(onboarding: UserOnboarding, key: OnboardingKey): boolean {
  const s = onboarding[key];
  return !!(s?.dismissedAt && !s?.completedAt);
}

/** 홈에서 어떤 튜토리얼 진입 UI를 보여줄지 — welcome(자동 모달) > nudge(재유도 배너) > none. */
export function resolveWelcomeState(
  onboarding: UserOnboarding,
  key: OnboardingKey,
): 'welcome' | 'nudge' | 'none' {
  if (shouldShowWelcome(onboarding, key)) return 'welcome';
  if (shouldShowResumeNudge(onboarding, key)) return 'nudge';
  return 'none';
}

/** /tutorial 페이지 가드 — 완주한 유저는 다시 볼 필요가 없어 /home 으로 돌려보낸다. */
export function isTutorialCompleted(onboarding: UserOnboarding, key: OnboardingKey): boolean {
  return !!onboarding[key]?.completedAt;
}
