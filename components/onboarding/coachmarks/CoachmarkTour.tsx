'use client';

import { useEffect, useState } from 'react';

import { CoachmarkOverlay } from './CoachmarkOverlay';
import { coachmarkSelector } from './coachmark-selector';
import { useAnchorRect } from './useAnchorRect';
import type { CoachmarkStep } from './types';

// 오프코스 리졸버 폴링 주기 — useAnchorRect의 보정 폴링(250ms)과 같은 리듬.
const RESOLVER_INTERVAL_MS = 250;
// 연속 N틱 동안 같은 불일치가 관찰돼야 점프한다 — 위저드 전환 한 프레임 사이의
// 과도기(이전 앵커 잔존/다음 앵커 미등장)에 오점프하지 않기 위한 히스테리시스.
const RESOLVER_CONFIRM_TICKS = 2;

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
  /**
   * 각 step의 target 탐색 타임아웃(ms). 기본값은 useAnchorRect 기본값을 따른다.
   * 주의: 오프코스 리졸버의 복귀 지연(~0.5s)보다 짧게 주면 notFound 전방 스킵이
   * 리졸버 복귀를 앞질러 막힌-클릭 복귀가 무력화된다 — 1000ms 미만은 피할 것.
   */
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

    // 막힌 클릭 복귀 — 폴백 경로: 평상시엔 오프코스 리졸버가 ~0.5s에 먼저 복귀시켜
    // 여기까지 오지 않는다(리졸버가 관망하는 모호/단일-action 상황에서만 의미).
    // action step 클릭이 실제로 접수됐지만(코치마크는 진행) 위저드 검증 등으로
    // 실제 진행이 막힌 경우(예: 프리필 제목을 지운 채 다음 클릭 — 위저드는
    // 토스트+필드 에러로 그 자리에 머문다), 다음 step의 타깃은 영원히 나타나지
    // 않아 notFound 타임아웃이 뜬다. 이때 그대로 전방 스킵하면 사용자는 안내를
    // 잃는다. 직전 step이 action이고 그 타깃이 아직 DOM에 있으면(클릭이 실제로는
    // 진행되지 않았다는 증거) 그 step으로 되돌아간다. 복귀 시점에 타깃이 이미
    // 존재하므로 useAnchorRect가 즉시 found로 전환돼 재-notFound 루프는 발생하지
    // 않는다 — 다음 notFound는 오직 사용자의 다음 실제 클릭 이후에만 재발할 수 있다.
    if (stepIndex > 0) {
      const prev = steps[stepIndex - 1];
      if (prev.kind === 'action' && document.querySelector(coachmarkSelector(prev.target))) {
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

  // 오프코스 리졸버: 사용자가 안내 코스를 벗어나 화면을 직접 바꿔도(위저드 이전/
  // 스텝 인디케이터 점프, info 안내 무시하고 실제 버튼 클릭, 검증에 막힌 클릭 등)
  // 코치마크가 현재 화면에 맞는 스텝으로 즉시 따라온다. 구조적 전제: 한 화면에는
  // 이 투어의 action 앵커가 최대 1개만 존재한다(위저드 next-N은 스텝별 상호배타 —
  // tours 드리프트 가드 테스트가 못박는다). 투어 형태 제약: action 뒤에 낀 info
  // 스텝(action→info→action)은 직전 action 앵커가 화면에 남아 있으면 되끌릴 수
  // 있다 — 현행 투어는 전부 info가 action 앞에만 오는 형태라 해당 없음.
  // 규칙 — 지금 DOM에 실재하는 action 앵커(candidate)가 투어가 기다리는 action
  // 스텝(expected = stepIndex 이후 첫 action)과 다르면 candidate로 점프한다.
  // 앵커가 0개(전환 중)거나 2개 이상(전제 붕괴 — 모호)이면 아무것도 하지 않고,
  // expected가 없으면(마지막 action 이후) 점프하지 않는다 — 방금 클릭한 앵커가
  // 화면에 남아 있는 것만으로 뒤로 끌려가는 역행을 막는다.
  //
  // 의존성은 steps의 "정체성"이 아니라 action target 내용 키다 — 소비자가 인라인
  // 배열을 넘겨 렌더마다 정체성이 바뀌어도 인터벌·히스테리시스 카운터가 리셋되지
  // 않는다(정체성 의존이면 리졸버가 조용히 무력화된다).
  const actionTargetsKey = steps
    .map((s) => (s.kind === 'action' ? s.target : ''))
    .join('|');
  useEffect(() => {
    const actionIndexes = steps.flatMap((s, i) => (s.kind === 'action' ? [i] : []));
    // action이 1개면 expected가 항상 그 스텝이라 점프 경로가 수학적으로 도달 불가 —
    // 인터벌을 만들지 않는다(단일 action 투어에서 무의미한 4Hz 폴 방지).
    if (actionIndexes.length < 2) return;

    let mismatchIndex = -1;
    let mismatchTicks = 0;
    const intervalId = setInterval(() => {
      const existing = actionIndexes.filter((i) =>
        document.querySelector(coachmarkSelector(steps[i].target)),
      );
      const expected = actionIndexes.find((i) => i >= stepIndex);
      if (existing.length !== 1 || expected === undefined || existing[0] === expected) {
        mismatchIndex = -1;
        mismatchTicks = 0;
        return;
      }
      if (existing[0] !== mismatchIndex) {
        mismatchIndex = existing[0];
        mismatchTicks = 1;
        return;
      }
      mismatchTicks += 1;
      if (mismatchTicks >= RESOLVER_CONFIRM_TICKS) {
        setStepIndex(mismatchIndex);
      }
    }, RESOLVER_INTERVAL_MS);
    return () => clearInterval(intervalId);
    // stepIndex 변경(점프 포함) 시 인터벌이 재생성되며 히스테리시스 카운터도 리셋된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- steps 내용은 actionTargetsKey가 대표(정체성 변화로 리졸버가 리셋되지 않게 의도)
  }, [actionTargetsKey, stepIndex]);

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
      if (!el?.closest(coachmarkSelector(target))) return;
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
