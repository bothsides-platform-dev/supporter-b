'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from './wizard-steps';

type WizardStepSidebarProps = {
  currentStep: number;
  // index 0..3 → step 1..4 의 입력 완료 여부 (순서 무관, 실제 입력 기준)
  completed: boolean[];
  onStepClick: (step: number) => void;
  /** 단계 정의 — 기본값은 구매사 RFP 작성 단계. */
  steps?: readonly { num: number; label: string }[];
  /** 사이드바 상단 제목 — 기본값은 구매사 플로우. */
  title?: string;
  /** 사이드바 하단 슬롯 — 견적 위저드의 '자동저장' 표시 등(기본 없음). */
  footer?: ReactNode;
  /** 컨테이너에 병합할 추가 클래스 (sticky/self-start 등 레이아웃 제어용). */
  className?: string;
};

export function WizardStepSidebar({
  currentStep,
  completed,
  onStepClick,
  steps = WIZARD_STEPS,
  title = '새 견적 요청',
  footer,
  className,
}: WizardStepSidebarProps) {
  return (
    <nav
      className={cn(
        'w-[160px] border-r border-[var(--md-sys-color-outline-variant)] px-3 py-5 flex-shrink-0 hidden lg:flex flex-col',
        className,
      )}
    >
      <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--md-sys-color-outline)] mb-4">
        {title}
      </span>
      {steps.map(({ num, label }) => {
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
      {footer && <div className="mt-auto pt-4">{footer}</div>}
    </nav>
  );
}
