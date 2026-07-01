'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useScroll, useMotionValueEvent, type MotionValue } from 'motion/react';

export type PinnedState = {
  /** 항상 true. 소비처 render-prop 분기 호환을 위해 유지(폴백 경로는 코드로 보존). */
  pinned: boolean;
  activeStep: number;
  progress: MotionValue<number>;
  scrollToStep: (index: number) => void;
};

// 섹션을 스크롤 동안 화면에 고정(pin)하고, 트랙 진행률(0→1)로 이산 단계(0..steps-1)와 연속
// progress를 자식에 넘긴다. 스크롤을 가로채지 않는 sticky 방식.
// 사용자 요청으로 모바일·저감모션 포함 '항상 활성'(정적 폴백 없음) — prefers-reduced-motion을
// 존중하지 않는 의도적 예외(랜딩 한정). 폴백 렌더 자체는 소비처에 코드로 남아 있어 이 게이트만
// 되돌리면 복구된다.
export function ScrollPinnedSection({
  steps,
  stepVh = 80,
  align = 'center',
  className,
  children,
}: {
  steps: number;
  stepVh?: number;
  /** pin 콘텐츠 세로 정렬. 'start'는 화면 위쪽에 고정(누적 등장처럼 위→아래로 쌓이는 섹션용). */
  align?: 'center' | 'start';
  className?: string;
  children: (s: PinnedState) => ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });
  const [activeStep, setActiveStep] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setActiveStep(Math.min(steps - 1, Math.max(0, Math.floor(v * steps))));
  });

  const scrollToStep = (index: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // useScroll offset ['start start','end end']는 진행률을 (트랙높이 − 뷰포트높이)로 정규화하므로
    // 클릭 목표 스크롤도 그 구간으로 매핑해야 그 스텝에 정확히 안착한다.
    const range = Math.max(0, rect.height - window.innerHeight);
    const top = window.scrollY + rect.top + ((index + 0.5) / steps) * range;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <div ref={trackRef} style={{ height: `${steps * stepVh}vh` }}>
      <div
        className={`sticky top-[var(--shell-topbar)] flex min-h-[calc(100svh-var(--shell-topbar))] flex-col ${align === 'start' ? 'justify-start pt-[8vh]' : 'justify-center'} ${className ?? ''}`}
      >
        {/* scrollToStep은 클릭 핸들러에서만 trackRef.current를 읽는다 — 렌더 중 ref 접근이 아니라
            컴파일러 정적 분석의 false positive. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        {children({ pinned: true, activeStep, progress: scrollYProgress, scrollToStep })}
      </div>
    </div>
  );
}
