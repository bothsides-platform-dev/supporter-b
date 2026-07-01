'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useScroll, useMotionValueEvent, type MotionValue } from 'motion/react';
import { useIsLgUp } from '@/hooks/use-lg-up';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

export type PinnedState = {
  pinned: boolean;
  activeStep: number;
  progress: MotionValue<number> | null;
  scrollToStep: (index: number) => void;
};

// 섹션을 스크롤 동안 화면에 고정(pin)하고, 트랙 진행률(0→1)로 이산 단계(0..steps-1)와
// 연속 progress를 자식에 넘긴다. reduced-motion·모바일(<lg)·마운트 전에는 pin 없이 폴백
// 렌더(소비처가 오늘의 정적 마크업을 그림). 스크롤을 가로채지 않는 sticky 방식.
export function ScrollPinnedSection({
  steps,
  stepVh = 80,
  className,
  children,
}: {
  steps: number;
  stepVh?: number;
  className?: string;
  children: (s: PinnedState) => ReactNode;
}) {
  const lgUp = useIsLgUp();
  // motionOk는 false로 시작 → SSR·첫 클라 렌더는 항상 폴백(하이드레이션 미스매치 방지).
  // 마운트 후 reduced-motion이 아니면 true로 승격.
  const [motionOk, setMotionOk] = useState(false);
  useEffect(() => {
    // 하이드레이션-세이프: SSR·첫 렌더는 항상 false(위 주석)로 고정하고, 마운트 후
    // 한 번만 실제 OS 설정으로 보정한다. 연쇄 렌더가 아니라 의도된 1회 후속 보정.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMotionOk(!prefersReducedMotion());
  }, []);
  const pinned = lgUp && motionOk;

  const trackRef = useRef<HTMLDivElement>(null);
  // pinned가 아닐 때는 트랙 div를 렌더하지 않아 trackRef가 영영 붙지 않는다 — target을
  // 그대로 넘기면 motion의 useScroll이 "ref가 있는데 hydrate 안 됨" invariant를 던진다
  // (motion.dev/troubleshooting/use-scroll-ref). pinned가 아닐 때 target을 생략해
  // (일반 문서 스크롤을 추적하되 아래에서 결과를 쓰지 않음) 폴백 마크업(래퍼 없음)을 유지한다.
  const { scrollYProgress } = useScroll({
    target: pinned ? trackRef : undefined,
    offset: ['start start', 'end end'],
  });
  const [activeStep, setActiveStep] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const s = Math.min(steps - 1, Math.max(0, Math.floor(v * steps)));
    setActiveStep(s);
  });

  const scrollToStep = (index: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = window.scrollY + rect.top + ((index + 0.5) / steps) * rect.height;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  if (!pinned) {
    return (
      <>
        {children({
          pinned: false,
          activeStep: steps - 1,
          progress: null,
          scrollToStep: () => {},
        })}
      </>
    );
  }

  return (
    <div ref={trackRef} style={{ height: `${steps * stepVh}vh` }}>
      <div
        className={`sticky top-[var(--shell-topbar)] flex min-h-[calc(100svh-var(--shell-topbar))] flex-col justify-center ${className ?? ''}`}
      >
        {/* scrollToStep은 클릭 핸들러에서만 trackRef.current를 읽는다(렌더 중엔 호출 안 됨) —
            컴파일러의 정적 ref-taint 분석이 "ref를 읽는 클로저가 렌더 출력에 포함"만 보고
            보수적으로 막는 false positive. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        {children({ pinned: true, activeStep, progress: scrollYProgress, scrollToStep })}
      </div>
    </div>
  );
}
