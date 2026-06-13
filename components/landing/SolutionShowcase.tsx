'use client';

import { useState, useEffect, useRef } from 'react';
import { useInView } from 'motion/react';
import { CheckIcon } from '@/components/icons';
import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

const STEP_MS = 2800;

// 해결 포인트 목록과 비교표를 하나의 'activeStep' 으로 묶어 연동한다. 화면에 보이는
// 동안 단계가 0→마지막→0 으로 순환하며, 현재 단계의 텍스트를 강조(나머지는 흐리게)하고
// 체크 표시를 키워 강조한다. 같은 단계 신호를 표에 내려보내 그 포인트가 말하는 컬럼을
// 하이라이트한다 — 텍스트와 표 애니메이션이 한 박자로 움직인다. 동작 줄이기 선호 시
// 순환을 멈추고 모든 포인트를 평평하게(강조 없이) 보여준다.
export function SolutionShowcase({ points }: { points: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [activeStep, setActiveStep] = useState<number | null>(null);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    // setState 는 effect 본문이 아니라 타이머 콜백에서만 호출(lint: set-state-in-effect).
    const kick = window.setTimeout(() => setActiveStep(0), 0);
    const id = window.setInterval(() => {
      setActiveStep((s) => ((s ?? -1) + 1) % points.length);
    }, STEP_MS);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [inView, points.length]);

  return (
    <div ref={ref} className="flex flex-col gap-[var(--s-8)]">
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
