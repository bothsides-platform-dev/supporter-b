'use client';

import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from './wizard-steps';

type WizardStepSidebarProps = {
  currentStep: number;
  // index 0..3 → step 1..4 의 입력 완료 여부 (순서 무관, 실제 입력 기준)
  completed: boolean[];
  onStepClick: (step: number) => void;
};

export function WizardStepSidebar({ currentStep, completed, onStepClick }: WizardStepSidebarProps) {
  return (
    <nav className="w-[160px] border-r border-[var(--md-sys-color-outline-variant)] px-3 py-5 flex-shrink-0 hidden lg:flex flex-col">
      <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--md-sys-color-outline)] mb-4">
        신규 제안 요청
      </span>
      {WIZARD_STEPS.map(({ num, label }) => {
        const isActive = num === currentStep;
        // 자유 이동 — 모든 단계 클릭 가능. 현재 step은 완료 상태여도 번호를 유지
        // (✓ 대신 하이라이트). 그 외 완료된 step만 ✓ — 위치가 아니라 실제 입력 기준.
        const isDone = !isActive && completed[num - 1];

        return (
          <button
            key={num}
            type="button"
            onClick={() => onStepClick(num)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-[var(--md-sys-shape-extra-small)] text-left mb-0.5 transition-colors cursor-pointer',
              isActive && 'bg-[var(--md-sys-color-surface-container-high)]',
              !isActive && 'hover:bg-[var(--md-sys-color-surface-container)]',
            )}
          >
            <span
              className={cn(
                'w-[18px] h-[18px] rounded-full flex items-center justify-center font-mono text-[9px] font-bold flex-shrink-0',
                isDone && 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)]',
                isActive && 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]',
                !isDone && !isActive && 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-outline)]',
              )}
            >
              {isDone ? '✓' : num}
            </span>
            <span
              className={cn(
                'font-mono text-[11px]',
                isActive && 'text-[var(--md-sys-color-on-surface)] font-semibold',
                isDone && 'text-[var(--md-sys-color-on-surface-variant)]',
                !isDone && !isActive && 'text-[var(--md-sys-color-outline)]',
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
