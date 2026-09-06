'use client';

/**
 * 회원가입 단계 표시줄 — 모든 signup step 에 마운트.
 * current: 현재 단계(1-based), total: 전체 단계 수.
 * Linear 디자인 언어 — 얇은 선형 인디케이터, 타입 small.
 */
export function SignupStepper({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-2 mb-6">
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium tracking-wide">
        {current} / {total}
      </p>
      <ol className="flex gap-1 list-none p-0 m-0" aria-label="가입 진행 단계">
        {Array.from({ length: total }, (_, i) => {
          const step = i + 1;
          const isActive = step <= current;
          return (
            <li
              key={step}
              aria-current={step === current ? 'step' : undefined}
              className="h-0.5 flex-1 rounded-full transition-colors duration-150"
              style={{
                backgroundColor: isActive
                  ? 'var(--md-sys-color-primary)'
                  : 'var(--md-sys-color-outline-variant)',
              }}
            />
          );
        })}
      </ol>
    </div>
  );
}
