// 홈 화면(BuyerHome)의 온보딩 진입 UI 노출 여부 — 순수 파생. 서버 로더가
// getUserRepo().getOnboarding(userId) 로 읽은 값을 그대로 넘긴다.
import type { UserOnboarding } from '@/lib/types/onboarding';

/** buyer 홈의 첫 견적 코치마크 노출 여부 — RFP가 하나도 없고 완료/닫기 스탬프가 없는 동안만. */
export function shouldShowFirstRfpCoachmark(onboarding: UserOnboarding, hasAnyRfp: boolean): boolean {
  const s = onboarding.buyerFirstRfp;
  return !hasAnyRfp && !s?.completedAt && !s?.dismissedAt;
}
