'use client';

// 튜토리얼 플로우(buyer/pg)가 공유하는 phase 상태머신 + 온보딩 스탬프.
//
// 두 플로우는 phase 이름만 다를 뿐 진행 규칙이 같다: 배열 순서대로 나아가고,
// 마지막 원소가 done 이며, 이탈은 dismissed·완주/건너뛰기는 completed 를 찍는다.
// 실질 차이는 온보딩 key 와 "이탈 직전 정리"(buyer 는 격리해 둔 실제 RFP 초안
// 복원) 하나뿐이라 그 둘만 주입받는다.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { stampOnboarding, stampSettled } from '@/components/onboarding/stamp-onboarding';
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
  // 마지막으로 발사한 스탬프 쓰기 — navigate 가 push 전에 settle 을 기다린다
  // (stamp-then-move). 스탬프 POST 와 /home RSC GET 은 별개 요청이라 순서 보장이
  // 없어, 쓰기를 앞지른 읽기가 완료 직후 환영 모달을 재노출시킬 수 있다.
  // stampOnboarding 은 절대 reject 하지 않으므로(실패는 토스트로 가시화) 실패해도
  // 이동은 진행된다 — 이탈 의사가 우선이고, dismissed 유실은 모달 재노출로 자기치유.
  const pendingStampRef = useRef<Promise<unknown>>(Promise.resolve());

  const donePhase = order[order.length - 1];
  const isDone = phase === donePhase;

  const navigate = async (route: string) => {
    // settle 대기에 상한(stampSettled) — 저속 네트워크에서 클릭이 얼어붙지 않게.
    await stampSettled(pendingStampRef.current);
    onLeave?.();
    router.push(route);
  };

  const handleExit = () => {
    pendingStampRef.current = stampOnboarding({ key: onboardingKey, event: 'dismissed' });
    void navigate('/home');
  };

  // 정상 완주와 코치마크 건너뛰기가 같은 종착지 — completed 스탬프 + done 화면.
  // 완주 직후 남아 있던 투어의 skip 이 늦게 들어올 수 있어 재진입을 막는다.
  // done 화면 전환은 즉시(지연 0) — 쓰기 대기는 이후 CTA 의 navigate 가 맡는다.
  const handleComplete = () => {
    if (isDone) return;
    pendingStampRef.current = stampOnboarding({ key: onboardingKey, event: 'completed' });
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
