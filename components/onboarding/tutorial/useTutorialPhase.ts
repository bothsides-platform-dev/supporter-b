'use client';

// 튜토리얼 플로우(buyer/pg)가 공유하는 phase 상태머신 + 온보딩 스탬프.
//
// 두 플로우는 phase 이름만 다를 뿐 진행 규칙이 같다: 배열 순서대로 나아가고,
// 마지막 원소가 done 이며, 이탈은 dismissed·완주/건너뛰기는 completed 를 찍는다.
// 실질 차이는 온보딩 key 와 "이탈 직전 정리"(buyer 는 격리해 둔 실제 RFP 초안
// 복원) 하나뿐이라 그 둘만 주입받는다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import type { OnboardingKey } from '@/lib/types/onboarding';

type Options<P extends string> = {
  /** 진행 순서. 마지막 원소가 done phase 다. */
  order: readonly P[];
  labels: Record<P, string>;
  onboardingKey: OnboardingKey;
  /** 튜토리얼을 떠나기 직전 정리 — 라우팅보다 먼저 실행된다. */
  onLeave?: () => void;
};

export function useTutorialPhase<P extends string>({
  order,
  labels,
  onboardingKey,
  onLeave,
}: Options<P>) {
  const router = useRouter();
  const [phase, setPhase] = useState<P>(order[0]);

  const donePhase = order[order.length - 1];
  const isDone = phase === donePhase;

  const navigate = (route: string) => {
    onLeave?.();
    router.push(route);
  };

  const handleExit = () => {
    void updateOnboardingAction({ key: onboardingKey, event: 'dismissed' });
    navigate('/home');
  };

  // 정상 완주와 코치마크 건너뛰기가 같은 종착지 — completed 스탬프 + done 화면.
  // 완주 직후 남아 있던 투어의 skip 이 늦게 들어올 수 있어 재진입을 막는다.
  const handleComplete = () => {
    if (isDone) return;
    void updateOnboardingAction({ key: onboardingKey, event: 'completed' });
    setPhase(donePhase);
  };

  return {
    phase,
    setPhase,
    stepNum: order.indexOf(phase) + 1,
    total: order.length,
    label: labels[phase],
    isDone,
    navigate,
    handleExit,
    handleComplete,
  };
}
