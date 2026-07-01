'use client';

import { cn } from '@/lib/utils';

const STEPS = ['홈', '견적 요청', '견적 비교·선정', '새 견적 요청'] as const;

// 임베디드 데모 가이드 투어의 단계 표시·제어 바. 상태는 셸이 소유하고 콜백으로 전달한다.
// autoplaying일 때 활성 단계 아래 진행 막대(.process-progress)가 intervalMs 동안 채워진다
// (prefers-reduced-motion 시 CSS가 애니메이션을 생략). labels로 구매사·PG 데모를 모두 구동.
export function DemoStepBar({
  current,
  autoplaying,
  intervalMs,
  onSelect,
  onReplay,
  labels = STEPS,
}: {
  current: number;
  autoplaying: boolean;
  intervalMs: number;
  onSelect: (step: number) => void;
  onReplay: () => void;
  labels?: readonly string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {labels.map((label, i) => {
          const step = i + 1;
          const isActive = step === current;
          return (
            <li key={label} className="min-w-0">
              <button
                type="button"
                aria-label={`${step} ${label}`}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(step)}
                className={cn(
                  'relative flex h-8 items-center gap-1.5 overflow-hidden rounded-[var(--md-sys-shape-small)] border px-2.5 text-[13px] transition-colors',
                  isActive
                    ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)]'
                    : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
                )}
              >
                <span className="md-numeric text-[var(--md-sys-color-on-surface-variant)]">{step}</span>
                <span className="truncate">{label}</span>
                {isActive && autoplaying && (
                  <span
                    key={current}
                    aria-hidden
                    className="process-progress absolute bottom-0 left-0 h-[2px] w-full origin-left bg-[var(--md-sys-color-primary)]"
                    style={{ animationDuration: `${intervalMs}ms` }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {!autoplaying && (
        <button
          type="button"
          onClick={onReplay}
          className="h-8 shrink-0 rounded-[var(--md-sys-shape-small)] px-2.5 text-[13px] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-on-surface)]"
        >
          처음부터 다시 보기
        </button>
      )}
    </div>
  );
}
