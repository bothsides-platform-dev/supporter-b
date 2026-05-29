// components/rfp/WizardProgressBar.tsx
'use client';

import { cn } from '@/lib/utils';
import { STEP_LABELS, WIZARD_STEPS } from './wizard-steps';

const TOTAL = WIZARD_STEPS.length;

type WizardProgressBarProps = {
  currentStep: number;    // 1-4
  maxReachedStep: number;
  /** 자유 이동 — dot 클릭 시 해당 단계로 이동. */
  onStepClick?: (step: number) => void;
};

export function WizardProgressBar({ currentStep, maxReachedStep, onStepClick }: WizardProgressBarProps) {
  return (
    <div className="lg:hidden border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL }, (_, i) => {
          const step = i + 1;
          const isDone = step < currentStep && step <= maxReachedStep;
          const isActive = step === currentStep;
          return (
            <button
              key={step}
              type="button"
              aria-label={`${step}단계: ${STEP_LABELS[step - 1]}`}
              onClick={() => onStepClick?.(step)}
              className="flex items-center justify-center p-1.5 -m-1 cursor-pointer"
            >
              <span
                data-testid="progress-dot"
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  isDone && 'w-1.5 bg-[var(--md-sys-color-tertiary)]',
                  isActive && 'w-4 bg-[var(--md-sys-color-primary)]',
                  !isDone && !isActive && 'w-1.5 bg-[var(--md-sys-color-outline-variant)]',
                )}
              />
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        Step {currentStep} / {TOTAL} — {STEP_LABELS[currentStep - 1]}
      </span>
    </div>
  );
}
