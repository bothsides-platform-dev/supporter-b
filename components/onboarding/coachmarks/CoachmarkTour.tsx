'use client';

import { useEffect, useState } from 'react';

import { CoachmarkOverlay } from './CoachmarkOverlay';
import { useAnchorRect } from './useAnchorRect';
import type { CoachmarkStep } from './types';

export type CoachmarkTourProps = {
  steps: CoachmarkStep[];
  /** 투어 자연 종료(마지막 step 완료·notFound 타임아웃 소진) — 로컬 닫힘 처리용. */
  onFinish?: () => void;
  /**
   * 오버레이의 건너뛰기 버튼 클릭 전용(전역 키 바인딩 없음). 의미는 호출자가
   * 정의한다 — 튜토리얼 플로우에서는 "튜토리얼 전체를 completed 처리하고 done
   * 화면으로 점프"라는 비가역 동작이므로, 새 소비자는 이 prop을 "이 투어만
   * 닫기"로 오독하지 말 것(그 용도는 onFinish 쪽 계약).
   */
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

  const { rect, status, disabled } = useAnchorRect(currentStep?.target ?? null, { timeoutMs });

  useEffect(() => {
    if (status !== 'notFound') return;

    // 막힌 클릭 복귀: action step 클릭이 실제로 접수됐지만(코치마크는 진행) 위저드
    // 검증 등으로 실제 진행이 막힌 경우(예: 프리필 제목을 지운 채 다음 클릭 —
    // 위저드는 토스트+필드 에러로 그 자리에 머문다), 다음 step의 타깃은 영원히
    // 나타나지 않아 notFound 타임아웃이 뜬다. 이때 그대로 전방 스킵하면 사용자는
    // 안내를 잃는다. 직전 step이 action이고 그 타깃이 아직 DOM에 있으면(클릭이
    // 실제로는 진행되지 않았다는 증거) 그 step으로 되돌아간다. 복귀 시점에 타깃이
    // 이미 존재하므로 useAnchorRect가 즉시 found로 전환돼 재-notFound 루프는
    // 발생하지 않는다 — 다음 notFound는 오직 사용자의 다음 실제 클릭 이후에만
    // 재발할 수 있다.
    if (stepIndex > 0) {
      const prev = steps[stepIndex - 1];
      if (
        prev.kind === 'action' &&
        document.querySelector(`[data-coachmark="${CSS.escape(prev.target)}"]`)
      ) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 막힌 클릭(위저드 검증 등)으로 코치마크만 앞서 나간 경우 직전 action step으로 되돌아가는 의도된 반응
        setStepIndex(stepIndex - 1);
        return;
      }
    }

    // 같은 target 문자열을 쓰는 연속 step은 함께 건너뛴다 — target이 안 바뀌면
    // useAnchorRect가 리셋되지 않아 status가 notFound에 머물러 투어가 조용히
    // 멈추기 때문(zombie). 다른 target에 도달하면 hook이 리셋되어 재탐색한다.
    const missingTarget = currentStep?.target;
    let next = stepIndex + 1;
    while (next < steps.length && steps[next].target === missingTarget) next += 1;
    if (next >= steps.length) {
      onFinish?.();
    } else {
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

  // Esc 전역 리스너는 두지 않는다 — onSkip이 튜토리얼 완료 처리(비가역)와 묶이면서
  // 코치마크 미표시 구간·⌘K 닫기 등 오발 Esc 한 번이 영구 완료가 되는 사고를 막는다.
  // 스킵은 오버레이의 건너뛰기 버튼 클릭으로만 발동한다.

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
      targetDisabled={disabled}
    />
  );
}
