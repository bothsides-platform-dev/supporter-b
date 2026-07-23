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

// 이동 게이트의 대기 상한 — stamp-then-move 는 쓰기 settle 을 기다려 /home RSC
// 읽기 레이스를 막지만, 저속 네트워크에서 이탈 클릭이 무한정 얼어붙으면 안 된다.
// 상한 초과 시 이동을 진행해도 dismissed 유실은 환영 모달 재노출로 자기치유된다.
export const STAMP_MOVE_DEADLINE_MS = 800;

/** 스탬프 settle 또는 deadline 중 먼저 오는 쪽에 resolve — 절대 reject 하지 않는다. */
export function stampSettled(
  stamp: Promise<unknown>,
  deadlineMs: number = STAMP_MOVE_DEADLINE_MS,
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, deadlineMs);
    void stamp.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

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
