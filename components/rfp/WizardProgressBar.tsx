// components/rfp/WizardProgressBar.tsx
'use client';

import { cn } from '@/lib/utils';
import { STEP_LABELS, WIZARD_STEPS } from './wizard-steps';

const TOTAL = WIZARD_STEPS.length;

type WizardProgressBarProps = {
  currentStep: number;    // 1-4
  maxReachedStep: number;
};

export function WizardProgressBar({ currentStep, maxReachedStep }: WizardProgressBarProps) {
  return (
    <div className="lg:hidden border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL }, (_, i) => {
          const step = i + 1;
          const isDone = step < currentStep && step <= maxReachedStep;
          const isActive = step === currentStep;
          return (
            <span
              key={step}
              data-testid="progress-dot"
              className={cn(
                'h-1.5 rounded-full transition-all',
                isDone && 'w-1.5 bg-[var(--md-sys-color-tertiary)]',
                isActive && 'w-4 bg-[var(--md-sys-color-primary)]',
                !isDone && !isActive && 'w-1.5 bg-[var(--md-sys-color-outline-variant)]',
              )}
            />
          );
        })}
      </div>
      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        Step {currentStep} / {TOTAL} — {STEP_LABELS[currentStep - 1]}
      </span>
    </div>
  );
}
