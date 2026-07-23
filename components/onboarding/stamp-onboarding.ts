'use client';

// 온보딩 스탬프(completed/dismissed) 발사의 단일 경로. fire-and-forget 이던
// updateOnboardingAction 호출 4곳(useTutorialPhase·WelcomeModal·TutorialLeaveGuard)을
// 모아 실패를 가시화한다 — {ok:false}는 예상된 실패라 토스트만, throw 만 Sentry
// (captureActionError 관례, SigningTab.run 참조). 절대 reject 하지 않으므로
// 호출측은 안심하고 await 하거나 void 로 흘릴 수 있다.
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import { toast } from '@/lib/toast';
import { captureActionError } from '@/lib/observability/capture';
import type { OnboardingKey } from '@/lib/types/onboarding';

const FAIL_MESSAGE = '체험 기록을 저장하지 못했어요';

export async function stampOnboarding(input: {
  key: OnboardingKey;
  event: 'completed' | 'dismissed';
}): Promise<boolean> {
  try {
    const r = await updateOnboardingAction(input);
    if (!r.ok) {
      toast(FAIL_MESSAGE, { type: 'error' });
      return false;
    }
    return true;
  } catch (err) {
    captureActionError('onboarding.stamp', err, null, input);
    toast(FAIL_MESSAGE, { type: 'error' });
    return false;
  }
}
