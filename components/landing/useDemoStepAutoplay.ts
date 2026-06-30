'use client';

import { useCallback, useEffect, useState } from 'react';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

export type DemoStepAutoplay = {
  step: number;
  setStep: (step: number) => void;
  stop: () => void;
  stopped: boolean;
};

// 랜딩 데모 마법사를 자동재생→조작 하이브리드로 구동한다. 인터벌마다 step을 전진시키되
// 마지막 step에서 멈추고, stop()(첫 사용자 조작) 이후로는 setStep으로만 움직인다.
// 동작 줄이기 선호 시 자동 전진하지 않는다(하드룰).
export function useDemoStepAutoplay(
  totalSteps: number,
  intervalMs: number,
  enabled = true,
): DemoStepAutoplay {
  const [step, setStep] = useState(1);
  const [stopped, setStopped] = useState(() => prefersReducedMotion());
  const stop = useCallback(() => setStopped(true), []);

  // step이 deps에 있어 effect가 단계마다 재실행되며, 그때마다 다음 단계 타이머를 새로 건다.
  useEffect(() => {
    if (!enabled || stopped || step >= totalSteps) return;
    const id = setTimeout(() => setStep(Math.min(totalSteps, step + 1)), intervalMs);
    return () => clearTimeout(id);
  }, [step, stopped, totalSteps, intervalMs, enabled]);

  return { step, setStep, stop, stopped };
}
