'use client';

import { useEffect, useState } from 'react';

import { CoachmarkOverlay } from './CoachmarkOverlay';
import { useAnchorRect } from './useAnchorRect';
import type { CoachmarkStep } from './types';

export type CoachmarkTourProps = {
  steps: CoachmarkStep[];
  onFinish?: () => void;
  onSkip?: () => void;
  /** 각 step의 target 탐색 타임아웃(ms). 기본값은 useAnchorRect 기본값을 따른다. */
  timeoutMs?: number;
};

/**
 * 코치마크 단계를 순회하는 오케스트레이터. target을 못 찾는 step(notFound)은
 * 투어를 블로킹하지 않고 자동으로 건너뛴다 — 투어가 절대 UI를 막은 채 멈추지
 * 않는 것이 불변식이다.
 */
export function CoachmarkTour({ steps, onFinish, onSkip, timeoutMs }: CoachmarkTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const hasSteps = steps.length > 0;
  const currentStep = hasSteps ? steps[stepIndex] : null;
  const isLast = stepIndex === steps.length - 1;

  const { rect, status } = useAnchorRect(currentStep?.target ?? null, { timeoutMs });

  useEffect(() => {
    if (status !== 'notFound') return;
    if (isLast) {
      onFinish?.();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- notFound 타임아웃 시 다음 step으로 자동 스킵하는 의도된 반응(투어가 멈추지 않는 것이 불변식)
      setStepIndex((index) => index + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!hasSteps) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSteps]);

  if (!hasSteps || !currentStep) return null;
  if (status !== 'found' || !rect) return null;

  const handleNext = () => {
    if (isLast) {
      onFinish?.();
    } else {
      setStepIndex((index) => index + 1);
    }
  };

  return (
    <CoachmarkOverlay
      rect={rect}
      step={currentStep}
      stepIndex={stepIndex}
      stepCount={steps.length}
      onNext={handleNext}
      onSkip={() => onSkip?.()}
      isLast={isLast}
    />
  );
}
