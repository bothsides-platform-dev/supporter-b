// components/rfp/WizardProgressBar.tsx
'use client';

import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from './wizard-steps';

type WizardProgressBarProps = {
  currentStep: number; // 1-4
  // index 0..3 → step 1..4 의 입력 완료 여부 (순서 무관, 실제 입력 기준)
  completed: boolean[];
  // index 0..3 → 해당 step에서 advance/goToStep 실패가 있었는지 (없으면 error dot 미표시)
  failedAt?: boolean[];
  /** 자유 이동 — dot 클릭 시 해당 단계로 이동. */
  onStepClick?: (step: number) => void;
  /** 단계 정의. 기본값은 구매사 RFP 4단계. */
  steps?: readonly { num: number; label: string }[];
};

export function WizardProgressBar({ currentStep, completed, failedAt, onStepClick, steps = WIZARD_STEPS }: WizardProgressBarProps) {
  const TOTAL = steps.length;
  const labels = steps.map((s) => s.label);
  return (
    <div className="lg:hidden border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL }, (_, i) => {
          const step = i + 1;
          const isActive = step === currentStep;
          const isComplete = completed[i];
          // 현재 step은 done 표시하지 않음(active 하이라이트 유지). 실패이력 있는 미완료만 error dot.
          const isDone = !isActive && isComplete;
          const isError = !isActive && !isComplete && !!(failedAt?.[i]);
          const reachable = completed.slice(0, i).every(Boolean);
          return (
            <button
              key={step}
              type="button"
              aria-label={`${step}단계: ${labels[step - 1]}`}
              onClick={() => onStepClick?.(step)}
              className={cn(
                'flex items-center justify-center p-1.5 -m-1',
                reachable || isActive ? 'cursor-pointer' : 'cursor-not-allowed',
              )}
            >
              <span
                data-testid="progress-dot"
                data-done={isDone ? 'true' : 'false'}
                data-error={isError ? 'true' : 'false'}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  isDone && 'w-1.5 bg-[var(--md-sys-color-tertiary)]',
                  isActive && 'w-4 bg-[var(--md-sys-color-primary)]',
                  isError && 'w-1.5 bg-[var(--md-sys-color-error)]',
                )}
              />
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        Step {currentStep} / {TOTAL} — {labels[currentStep - 1]}
      </span>
    </div>
  );
}
