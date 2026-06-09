'use client';

import { useState, useEffect, useRef } from 'react';
import { useInView } from 'motion/react';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

type MetricCardProps = {
  /** 카운트업 목표값 */
  to: number;
  /** 소수 자릿수 */
  decimals: number;
  /** 숫자 뒤 단위 (예: '%', '주', '만원') */
  unit: string;
  caption: string;
  /** 숫자 옆 한정어 (예: '절감', '감소') */
  qualifier?: string;
};

const COUNT_MS = 1400;

// 화면에 들어오면 0 → 목표값으로 숫자가 차오른다(실시간으로 개선되는 느낌).
// 동작 줄이기/SSR/테스트에서는 즉시 목표값.
function useCountUp(to: number, play: boolean): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (!play) return;
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 동작 줄이기: 1회 즉시 표시
      setCurrent(to);
      return;
    }
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setCurrent(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setCurrent(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, play]);
  return current;
}

export function MetricCard({ to, decimals, unit, caption, qualifier }: MetricCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const current = useCountUp(to, inView);

  return (
    <div ref={ref} className="flex flex-col gap-[var(--s-3)]">
      <span className="flex items-baseline gap-2">
        <span className="md-numeric text-[clamp(34px,5vw,56px)] leading-none tracking-[-0.03em] text-[var(--md-sys-color-on-surface)]">
          {current.toFixed(decimals)}
          {unit}
        </span>
        {qualifier && (
          <span className="text-[var(--text-md)] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            {qualifier}
          </span>
        )}
      </span>
      <span className="text-[var(--text-sm)] leading-[1.5] text-[var(--md-sys-color-on-surface-variant)]">
        {caption}
      </span>
    </div>
  );
}
