'use client';

import { useState, useEffect, useRef } from 'react';
import { useInView } from 'motion/react';
import { ArrowUpIcon, ArrowDownIcon } from '@/components/icons';
import { landingMotionUnavailable } from '@/lib/landing/prefers-reduced-motion';

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
  /** 추세 화살표 방향 — 비용·시간이 내려가면 'down', 절감액이 올라가면 'up'. 색은 항상 긍정(tertiary). */
  trend?: 'up' | 'down';
};

const COUNT_MS = 1400;

// 화면에 들어오면 0 → 목표값으로 숫자가 차오른다(실시간으로 개선되는 느낌).
// 카운트업이 끝나면 done=true 가 되어 추세 화살표가 슬라이드+페이드 인 한다.
// 동작 줄이기 선호는 무시(랜딩 연출 항상 실행) — SSR/테스트(matchMedia 없음)에서만 즉시 목표값 + done.
function useCountUp(to: number, play: boolean): { value: number; done: boolean } {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!play) return;
    if (landingMotionUnavailable()) {
      /* eslint-disable react-hooks/set-state-in-effect -- SSR/테스트: 1회 즉시 표시 */
      setCurrent(to);
      setDone(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setCurrent(to * eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setCurrent(to);
        setDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, play]);
  return { value: current, done };
}

export function MetricCard({ to, decimals, unit, caption, trend }: MetricCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const { value: current, done } = useCountUp(to, inView);
  const Arrow = trend === 'up' ? ArrowUpIcon : ArrowDownIcon;

  return (
    // 밴드의 한 칸: 모바일·태블릿은 위아래, md 이상은 좌우 구분선 사이에 놓인다(구분선은 부모 divide-*).
    <div ref={ref} className="flex flex-col gap-[var(--s-4)] py-[var(--s-7)] md:px-[var(--s-7)] md:first:pl-0 md:last:pr-0">
      <span className="flex items-start gap-[var(--s-3)]">
        <span
          data-metric-value
          className="md-numeric whitespace-nowrap text-[clamp(44px,6vw,72px)] leading-none tracking-[-0.035em] text-[var(--md-sys-color-on-surface)]"
        >
          {current.toFixed(decimals)}
          <span data-metric-unit className="ml-[0.08em] text-[0.42em] tracking-[-0.01em] text-[var(--md-sys-color-on-surface-variant)]">
            {unit}
          </span>
        </span>
        {trend && (
          <span
            data-trend={trend}
            aria-hidden
            className="mt-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              opacity: done ? 1 : 0,
              transform: done ? 'translateY(0)' : `translateY(${trend === 'up' ? '8px' : '-8px'})`,
            }}
          >
            <Arrow size={16} />
          </span>
        )}
      </span>
      <span className="max-w-[24ch] text-sm leading-[1.5] text-[var(--md-sys-color-on-surface-variant)] break-keep">
        {caption}
      </span>
    </div>
  );
}
