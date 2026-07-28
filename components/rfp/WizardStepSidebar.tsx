'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from './wizard-steps';

type WizardStepSidebarProps = {
  currentStep: number;
  // index 0..3 → step 1..4 의 입력 완료 여부 (순서 무관, 실제 입력 기준)
  completed: boolean[];
  // index 0..3 → 해당 step에서 advance/goToStep 실패가 있었는지 (없으면 ✗ 미표시)
  failedAt?: boolean[];
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
  failedAt,
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
      <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mb-4">
        {title}
      </span>
      {steps.map(({ num, label }) => {
        const isActive = num === currentStep;
        const isComplete = completed[num - 1];
        // 비활성 + 완료 → ✓ / 비활성 + 실패이력 있는 미완료 → ✗ / 활성 → 번호
        const isDone = !isActive && isComplete;
        const isError = !isActive && !isComplete && !!(failedAt?.[num - 1]);
        // step N 도달 조건: steps 1..N-1 이 모두 complete
        const reachable = completed.slice(0, num - 1).every(Boolean);

        return (
          <button
            key={num}
            type="button"
            onClick={() => onStepClick(num)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-[var(--md-sys-shape-extra-small)] text-left mb-0.5 transition-colors',
              isActive && 'bg-[var(--md-sys-color-surface-container-high)]',
              !isActive && reachable && 'hover:bg-[var(--md-sys-color-surface-container)] cursor-pointer',
              !isActive && !reachable && 'cursor-not-allowed opacity-50',
            )}
          >
            <span
              className={cn(
                'w-[18px] h-[18px] rounded-full flex items-center justify-center md-numeric text-[9px] font-bold flex-shrink-0',
                isDone && 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)]',
                isError && 'bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)]',
                isActive && 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]',
                !isDone && !isError && !isActive && 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]',
              )}
            >
              {isDone ? '✓' : isError ? '✗' : num}
            </span>
            <span
              className={cn(
                'md-label-small',
                // 완료·실패·미방문 라벨은 한 톤(on-surface-variant)으로 모인다 —
                // 상태는 왼쪽 배지(✓/✗/번호 + 배경색)가 이미 구분해 준다.
                isActive
                  ? 'text-[var(--md-sys-color-on-surface)] font-semibold'
                  : 'text-[var(--md-sys-color-on-surface-variant)]',
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
