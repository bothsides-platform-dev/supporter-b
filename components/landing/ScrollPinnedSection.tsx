'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useScroll, useMotionValueEvent } from 'motion/react';

export type PinnedState = {
  /** 콘텐츠 높이에 따른 현재 고정 상태. */
  pinned: boolean;
  activeStep: number;
  goToStep: (step: number) => void;
};

// 기본은 기존 랜딩의 항상 고정 동작. releaseOnOverflow를 켠 소비처만
// 실제 콘텐츠 높이에 따라 고정을 해제하며, 직접 선택은 두 모드에서 유지한다.
export function ScrollPinnedSection({
  steps,
  stepVh = 80,
  align = 'center',
  className,
  releaseOnOverflow = false,
  children,
}: {
  steps: number;
  stepVh?: number;
  /** pin 콘텐츠 세로 정렬. 'start'는 화면 위쪽에 고정(누적 등장처럼 위→아래로 쌓이는 섹션용). */
  align?: 'center' | 'start';
  className?: string;
  /** 콘텐츠가 헤더 아래 화면에 들어가지 않으면 일반 문서 흐름으로 전환한다. */
  releaseOnOverflow?: boolean;
  children: (s: PinnedState) => ReactNode;
}) {
  // 방어적 가드: steps<=0은 현재 모든 호출부가 상수 배열 길이(>=4)를 넘겨 도달 불가능하지만,
  // 0으로 나눗셈/음수 clamp로 깨지는 것을 막기 위해 최소 1로 바닥을 둔다. steps>=1인 모든
  // 실사용 입력에서는 safeSteps === steps로 동작이 완전히 동일하다.
  const safeSteps = Math.max(1, steps);
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    if (!releaseOnOverflow) return;
    const measure = () => {
      if (!contentRef.current || !frameRef.current) return;
      const styles = getComputedStyle(frameRef.current);
      const header = parseFloat(styles.getPropertyValue('--landing-header-height')) || 0;
      const padding = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      setPinned(contentRef.current.getBoundingClientRect().height + padding <= window.innerHeight - header);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    if (contentRef.current) observer?.observe(contentRef.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [releaseOnOverflow]);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (!pinned) return;
    setActiveStep(Math.min(safeSteps - 1, Math.max(0, Math.floor(v * safeSteps))));
  });

  function goToStep(step: number) {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.min(safeSteps - 1, Math.max(0, step));
    if (!pinned) { setActiveStep(index); return; }
    const start = track.getBoundingClientRect().top + window.scrollY;
    const travel = Math.max(0, track.offsetHeight - window.innerHeight);
    // 각 구간 중앙으로 이동해 경계의 반올림과 sticky 헤더 오차를 피한다.
    window.scrollTo({ top: start + travel * ((index + 0.5) / safeSteps), behavior: 'smooth' });
  }

  return (
    <div ref={trackRef} data-pinned={pinned} style={{ height: pinned ? `${safeSteps * stepVh}vh` : undefined }}>
      <div ref={frameRef}
        className={`${pinned ? 'sticky top-[var(--landing-header-height)]' : 'relative'} flex min-h-[calc(100svh-var(--landing-header-height))] flex-col ${align === 'start' ? 'justify-start pt-[8vh]' : 'justify-center'} ${className ?? ''}`}
      >
        {/* goToStep은 소비처 버튼의 클릭 핸들러에서만 실행한다. render prop은 함수를 전달할 뿐 ref를 읽지 않는다. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        <div ref={contentRef}>{children({ pinned, activeStep, goToStep })}</div>
      </div>
    </div>
  );
}
