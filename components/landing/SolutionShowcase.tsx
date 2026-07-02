'use client';

import { CheckIcon } from '@/components/icons';
import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';

// 해결 포인트 목록과 비교표를 하나의 activeStep으로 묶어 연동한다. 구동원은 외부(스크롤).
// activeStep=i면 그 포인트를 강조(나머지 흐리게)하고, 같은 신호를 표에 내려 컬럼/추천행을
// 하이라이트한다. activeStep이 없으면(null) 모두 평평하게(강조 없이) 보여준다.
export function SolutionShowcase({
  points,
  activeStep = null,
}: {
  points: string[];
  activeStep?: number | null;
}) {
  return (
    <div className="flex flex-col gap-[var(--s-8)]">
      <ul className="flex flex-col gap-[var(--s-5)]">
        {points.map((point, i) => {
          const isActive = activeStep === i;
          const dim = activeStep !== null && !isActive;
          return (
            <li
              key={point}
              data-active={isActive ? 'true' : undefined}
              className="flex items-start gap-[var(--s-4)] transition-opacity duration-500"
              style={{ opacity: dim ? 0.4 : 1 }}
            >
              <span
                aria-hidden
                className={[
                  'mt-0.5 shrink-0 grid place-items-center h-5 w-5 rounded-full',
                  'transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                  isActive
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                    : 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)]',
                ].join(' ')}
                style={{
                  transform: isActive ? 'scale(1.18)' : 'scale(1)',
                  boxShadow: isActive
                    ? '0 0 0 4px color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent)'
                    : 'none',
                }}
              >
                <CheckIcon size={13} />
              </span>
              <span
                className={[
                  'text-[var(--text-md)] leading-[1.6] tracking-[-0.006em] transition-colors duration-300',
                  isActive
                    ? 'text-[var(--md-sys-color-on-surface)] font-medium'
                    : 'text-[var(--md-sys-color-on-surface)]',
                ].join(' ')}
              >
                {point}
              </span>
            </li>
          );
        })}
      </ul>
      <OfferComparisonTable activeStep={activeStep} />
    </div>
  );
}
