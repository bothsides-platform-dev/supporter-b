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
    // 같은 target 문자열을 쓰는 연속 step은 함께 건너뛴다 — target이 안 바뀌면
    // useAnchorRect가 리셋되지 않아 status가 notFound에 머물러 투어가 조용히
    // 멈추기 때문(zombie). 다른 target에 도달하면 hook이 리셋되어 재탐색한다.
    const missingTarget = currentStep?.target;
    let next = stepIndex + 1;
    while (next < steps.length && steps[next].target === missingTarget) next += 1;
    if (next >= steps.length) {
      onFinish?.();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- notFound 타임아웃 시 다음 step으로 자동 스킵하는 의도된 반응(투어가 멈추지 않는 것이 불변식)
      setStepIndex(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!currentStep || currentStep.kind !== 'action' || status !== 'found') return;
    const target = currentStep.target;
    const advanceIsLast = isLast;
    // 문서 레벨 capture 리스너 — 요소 identity가 리렌더로 바뀌어도 data-coachmark로
    // 매칭한다. capture 시점에 진행을 예약해도 실제 버튼의 React 핸들러는 그대로
    // 실행되고, 다음 step의 리스너는 post-render effect에 붙으므로 같은 클릭을
    // 이중 소비하지 않는다.
    const handleClick = (event: MouseEvent) => {
      const el = event.target instanceof Element ? event.target : null;
      if (!el?.closest(`[data-coachmark="${CSS.escape(target)}"]`)) return;
      if (advanceIsLast) {
        onFinish?.();
      } else {
        setStepIndex((index) => index + 1);
      }
    };
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.target, currentStep?.kind, status, isLast]);

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
